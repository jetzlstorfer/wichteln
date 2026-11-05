targetScope = 'resourceGroup'

param location string
param namePrefix string
param tags object
param environmentId string
param identityId string
param identityClientId string
param tableEndpoint string
param registryServer string
param imageRepository string

@description('An already-pushed immutable tag or sha256 digest. Empty is invalid when deploying workloads.')
@minLength(1)
param imageTag string

param publicUrl string = ''

@minValue(1)
@maxValue(10)
param maxReplicas int = 2

var image = startsWith(imageTag, 'sha256:')
  ? '${registryServer}/${imageRepository}@${imageTag}'
  : '${registryServer}/${imageRepository}:${imageTag}'
var managedIdentity = {
  type: 'UserAssigned'
  userAssignedIdentities: {
    '${identityId}': {}
  }
}
var registries = [
  {
    server: registryServer
    identity: identityId
  }
]
var applicationEnv = concat([
  {
    name: 'STORAGE_BACKEND'
    value: 'azure'
  }
  {
    name: 'TABLE_ENDPOINT'
    value: tableEndpoint
  }
  {
    name: 'TABLE_ROUNDS'
    value: 'WichtelnRounds'
  }
  {
    name: 'TABLE_LINKS'
    value: 'WichtelnLinks'
  }
  {
    name: 'TABLE_RATES'
    value: 'WichtelnRates'
  }
  {
    name: 'AZURE_CLIENT_ID'
    value: identityClientId
  }
  {
    name: 'TRUST_PROXY'
    value: 'true'
  }
  {
    name: 'PORT'
    value: '8787'
  }
  {
    name: 'HOST'
    value: '0.0.0.0'
  }
  {
    name: 'NODE_ENV'
    value: 'production'
  }
], empty(publicUrl) ? [] : [
  {
    name: 'PUBLIC_URL'
    value: publicUrl
  }
])
var containerResources = {
  cpu: json('0.25')
  memory: '0.5Gi'
}

resource app 'Microsoft.App/containerApps@2025-01-01' = {
  name: '${namePrefix}-app'
  location: location
  tags: tags
  identity: managedIdentity
  properties: {
    managedEnvironmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      registries: registries
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 8787
        transport: 'auto'
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
      }
    }
    template: {
      containers: [
        {
          name: 'wichteln'
          image: image
          resources: containerResources
          env: applicationEnv
          probes: [
            {
              type: 'Startup'
              httpGet: {
                path: '/api/health'
                port: 8787
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 3
              failureThreshold: 10
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 8787
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 3
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/live'
                port: 8787
                scheme: 'HTTP'
              }
              initialDelaySeconds: 30
              periodSeconds: 30
              timeoutSeconds: 3
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

resource maintenance 'Microsoft.App/jobs@2025-01-01' = {
  name: '${namePrefix}-maintenance'
  location: location
  tags: tags
  identity: managedIdentity
  properties: {
    environmentId: environmentId
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 1800
      replicaRetryLimit: 3
      registries: registries
      scheduleTriggerConfig: {
        cronExpression: '0 */6 * * *'
        parallelism: 1
        replicaCompletionCount: 1
      }
    }
    template: {
      containers: [
        {
          name: 'maintenance'
          image: image
          command: [
            'node'
          ]
          args: [
            'dist/server/index.js'
            '--maintenance'
          ]
          resources: containerResources
          env: applicationEnv
        }
      ]
    }
  }
}

output appName string = app.name
output appUrl string = 'https://${app.properties.configuration.ingress.fqdn}'
output maintenanceJobName string = maintenance.name
