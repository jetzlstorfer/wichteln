using './main.bicep'

param namePrefix = 'wichteln'
param deployApp = false
param imageRepository = 'wichteln'
// Set to the immutable release tag or sha256 digest before enabling deployApp.
param imageTag = ''
param publicUrl = ''
param maxReplicas = 2
param enableLogAnalytics = false
param logRetentionDays = 30
param logDailyQuotaGb = 1
