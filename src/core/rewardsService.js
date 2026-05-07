/**
 * File: src/core/rewardsService.js
 */
const { query } = require('./db');

const DATA_VERSION = "2026-04-14-5";

const DEFAULT_REWARDS = [
  {
    item_type: "Approvals Hero",
    requirement: "Highest Bonus Approvals",
    conditions: "50% On Num\n50% On Quantity",
    rate: "Q/Region",
    reward: "3 Days",
    approvals: "",
    sort_order: 1,
  },
  {
    item_type: "New Closed Account",
    requirement: "Penetration for minimum 3 Accounts/ Same Product",
    conditions: "Max 3000 LE",
    rate: "S",
    reward: "3% Of Invoice",
    approvals: "",
    sort_order: 2,
  },
  {
    item_type: "Launch Heros",
    requirement: "Top 3 Ach%/ Region",
    conditions: "Min Ach 90%",
    rate: "Q",
    reward: "5,000 – 3,000 – 1,500",
    approvals: "",
    sort_order: 3,
  },
  {
    item_type: "Best Achievers",
    requirement: "Top 3 Ach%",
    conditions: "3 MRs/ Region",
    rate: "Q",
    reward: "Development",
    approvals: "",
    sort_order: 4,
  },
  {
    item_type: "Best Performance",
    requirement: "Top 3 KPIs%",
    conditions: "3 MRs/ Region",
    rate: "Q",
    reward: "Development",
    approvals: "",
    sort_order: 5,
  },
  {
    item_type: "Top Player",
    requirement: "Highest MR (Ach% + KPIs) / Line",
    conditions: "1 MR/ Line",
    rate: "Q",
    reward: "5,000",
    approvals: "",
    sort_order: 6,
  },
  {
    item_type: "Signature Call",
    requirement: "Best Call Per PM",
    conditions: "1/ Region",
    rate: "Q",
    reward: "Development",
    approvals: "",
    sort_order: 7,
  },
  {
    item_type: "Persistent Achiever",
    requirement: "4 Q Achievement in a row",
    conditions: "--",
    rate: "A",
    reward: "2 Nights Accommodation",
    approvals: "",
    sort_order: 8,
  },
];

const DEFAULT_CHAMPIONS = [
  {
    item_type: "Champions",
    requirement: "Ach% 110%\nCRM KPIs min 80%\nMarket Performance KPIs Min 80\nSelf Development (1/S)\nTurnover Rate\nTime to hire\nPulse survey\nMin Ach 90%",
    conditions: "2 Semesters = Incentive Trip",
    rate: "S",
    reward: "7,000",
    sort_order: 1,
  }
];

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS business_rewards (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_type VARCHAR(255) NOT NULL,
      requirement TEXT,
      conditions TEXT,
      rate VARCHAR(255),
      reward TEXT,
      approvals TEXT,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `, [], 'commit');

  await query(`
    CREATE TABLE IF NOT EXISTS business_rewards_champions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_type VARCHAR(255) NOT NULL,
      requirement TEXT,
      conditions TEXT,
      rate VARCHAR(255),
      reward TEXT,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `, [], 'commit');

  await query(`
    CREATE TABLE IF NOT EXISTS business_rewards_meta (
      meta_key VARCHAR(64) PRIMARY KEY,
      meta_value VARCHAR(255)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `, [], 'commit');
}

async function setDataVersion(version) {
  await query(
    "REPLACE INTO business_rewards_meta (meta_key, meta_value) VALUES ('data_version', ?)",
    [version],
    'commit'
  );
}

async function getDataVersion() {
  const row = await query(
    "SELECT meta_value FROM business_rewards_meta WHERE meta_key = 'data_version'",
    [],
    'fetchone'
  );
  return row ? row.meta_value : "";
}

async function replaceTable(tableName, rows, withApprovals = false) {
  await query(`TRUNCATE TABLE ${tableName}`, [], 'commit');
  
  for (const row of rows) {
    if (withApprovals) {
      await query(
        `INSERT INTO business_rewards (item_type, requirement, conditions, rate, reward, approvals, sort_order) VALUES (?,?,?,?,?,?,?)`,
        [
          row.item_type,
          row.requirement,
          row.conditions,
          row.rate,
          row.reward,
          row.approvals || "",
          row.sort_order || 0
        ],
        'commit'
      );
    } else {
      await query(
        `INSERT INTO business_rewards_champions (item_type, requirement, conditions, rate, reward, sort_order) VALUES (?,?,?,?,?,?)`,
        [
          row.item_type,
          row.requirement,
          row.conditions,
          row.rate,
          row.reward,
          row.sort_order || 0
        ],
        'commit'
      );
    }
  }
}

async function seedIfNeeded() {
  const currentVersion = await getDataVersion();
  
  if (currentVersion !== DATA_VERSION) {
    await replaceTable("business_rewards", DEFAULT_REWARDS, true);
    await replaceTable("business_rewards_champions", DEFAULT_CHAMPIONS, false);
    await setDataVersion(DATA_VERSION);
    return;
  }

  // Check if tables are empty even if version matches (fresh DB scenario)
  const countRewardsRow = await query("SELECT COUNT(*) AS c FROM business_rewards", [], 'fetchone');
  const countRewards = countRewardsRow ? parseInt(countRewardsRow.c || 0) : 0;

  const countChampionsRow = await query("SELECT COUNT(*) AS c FROM business_rewards_champions", [], 'fetchone');
  const countChampions = countChampionsRow ? parseInt(countChampionsRow.c || 0) : 0;

  if (countRewards === 0) {
    await replaceTable("business_rewards", DEFAULT_REWARDS, true);
  }
  if (countChampions === 0) {
    await replaceTable("business_rewards_champions", DEFAULT_CHAMPIONS, false);
  }
}

async function listRewards() {
  await ensureTables();
  await seedIfNeeded();
  return await query("SELECT * FROM business_rewards ORDER BY sort_order, id", [], 'fetchall');
}

async function listChampions() {
  await ensureTables();
  await seedIfNeeded();
  return await query("SELECT * FROM business_rewards_champions ORDER BY sort_order, id", [], 'fetchall');
}

module.exports = {
  listRewards,
  listChampions
};