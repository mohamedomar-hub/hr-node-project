/**
 * File: src/routes/rewardsRoutes.js
 */
const express = require('express');
const router = express.Router();
const { requirePermission } = require('../core/authUtils');
const rewardsService = require('../core/rewardsService');

router.get('/business_rewards', requirePermission('business_rewards'), async (req, res) => {
  try {
    const rewards = await rewardsService.listRewards();
    const champions = await rewardsService.listChampions();
    
    res.render('business_rewards', { 
      rewards: rewards, 
      champions: champions 
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

module.exports = router;