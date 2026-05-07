/**
 * File: src/core/index.js
 * Optional: Aggregates all core services for easier importing
 */
module.exports = {
  db: require('./db'),
  authUtils: require('./authUtils'),
  utils: require('./utils'),
  employeeService: require('./employeeService'),
  leavesService: require('./leavesService'),
  salaryService: require('./salaryService'),
  expensesService: require('./expensesService'),
  communityService: require('./communityService'),
  certificateService: require('./certificateService'),
  rewardsService: require('./rewardsService'),
  selfDevService: require('./selfDevService'),
  complianceService: require('./complianceService'),
  notificationsService: require('./notificationsService'),
  movementsService: require('./movementsService'),
  hrRequestsService: require('./hrRequestsService'),
  personalEmailService: require('./personalEmailService'),
  idpService: require('./idpService'),
  encryptionUtils: require('./encryptionUtils')
};