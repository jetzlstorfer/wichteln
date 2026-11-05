targetScope = 'resourceGroup'

@description('Azure region supporting Container Apps Consumption.')
param location string = resourceGroup().location

@description('Lowercase letters, digits and single hyphens; start with a letter and end with a letter or digit.')
@minLength(2)
@maxLength(20)
param namePrefix string = 'wichteln'

@description('False bootstraps infrastructure only. True requires an existing application image in the registry.')
param deployApp bool = false

@description('Repository inside the provisioned ACR.')
@minLength(1)
param imageRepository string = 'wichteln'

@description('Immutable tag, or sha256:<64 hex characters>. Required when deployApp=true; ignored otherwise.')
param imageTag string = ''

@description('Optional HTTPS public base URL. Empty lets the application use CONTAINER_APP_HOSTNAME at runtime.')
param publicUrl string = ''

@minValue(1)
@maxValue(10)
param maxReplicas int = 2

@minValue(1)
@maxValue(10)
param minReplicas int = 1

@description('Opt in to potentially sensitive console/system logs and their ingestion charges. Off by default.')
param enableLogAnalytics bool = false

@allowed([
  30
  60
  90
])
param logRetentionDays int = 30

@description('Log Analytics daily ingestion cap in GB. A cost guardrail, not a guaranteed hard spending limit.')
@minValue(1)
@maxValue(10)
param logDailyQuotaGb int = 1

param tags object = {
  application: 'wichteln'
}

var suffix = uniqueString(resourceGroup().id, namePrefix)
var tableNames = [
  'WichtelnRounds'
  'WichtelnLinks'
  'WichtelnRates'
]
var tableContributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3')
var acrPullRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'st${suffix}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowSharedKeyAccess: false
    allowBlobPublicAccess: false
    defaultToOAuthAuthentication: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'None'
    }
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {}
}

resource tables 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-05-01' = [for tableName in tableNames: {
  parent: tableService
  name: tableName
  properties: {}
}]

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${namePrefix}-identity'
  location: location
  tags: tags
}

resource storageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, identity.id, tableContributorRoleId)
  scope: storage
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: tableContributorRoleId
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2025-04-01' = {
  name: 'acr${suffix}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    anonymousPullEnabled: false
    publicNetworkAccess: 'Enabled'
    policies: {
      azureADAuthenticationAsArmPolicy: {
        status: 'enabled'
      }
    }
  }
}

resource registryRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, acrPullRoleId)
  scope: registry
  properties: {
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: acrPullRoleId
  }
}

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = if (enableLogAnalytics) {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: logRetentionDays
    workspaceCapping: {
      dailyQuotaGb: logDailyQuotaGb
    }
  }
}

resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: '${namePrefix}-environment'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: enableLogAnalytics ? {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace!.properties.customerId
        sharedKey: workspace!.listKeys().primarySharedKey
      }
    } : {}
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

module workloads 'workloads.bicep' = if (deployApp) {
  name: '${namePrefix}-workloads'
  params: {
    location: location
    namePrefix: namePrefix
    tags: tags
    environmentId: environment.id
    identityId: identity.id
    identityClientId: identity.properties.clientId
    tableEndpoint: storage.properties.primaryEndpoints.table
    registryServer: registry.properties.loginServer
    imageRepository: imageRepository
    imageTag: imageTag
    publicUrl: publicUrl
    maxReplicas: maxReplicas
    minReplicas: minReplicas
  }
  dependsOn: [
    tables
    storageRole
    registryRole
  ]
}

output registryName string = registry.name
output registryLoginServer string = registry.properties.loginServer
output storageAccountName string = storage.name
output tableEndpoint string = storage.properties.primaryEndpoints.table
output managedIdentityClientId string = identity.properties.clientId
output environmentName string = environment.name
output appName string = deployApp ? workloads!.outputs.appName : ''
output appUrl string = deployApp ? workloads!.outputs.appUrl : ''
output maintenanceJobName string = deployApp ? workloads!.outputs.maintenanceJobName : ''
