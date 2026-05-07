const DM_APPRAISAL_SECTIONS = [
  {
    id: 'dm_compete_lead_succeed',
    title: '1. Compete to Lead & Succeed',
    rows: [
      {
        key: 'critical_thinking',
        competency: 'Critical Thinking',
        points: [
          'Strong understanding of the assigned territory, including area type, key doctors, key accounts, and related contracts.',
          'Make Effictive Analysis.',
          'Can take the appropriate descions.',
          'Generating innovative solutions.'
        ]
      },
      {
        key: 'planning_time_management',
        competency: 'Planning & Time Management',
        points: [
          'Plans coaching effectively and adheres to the planned schedule.',
          'Prioritizes tasks based on importance, urgency, and long-term objectives.',
          'His team Plan effectively and adheres to the planned schedule.'
        ]
      },
      {
        key: 'commercial_practice',
        competency: 'Commericial Practice',
        points: [
          'His Team Effectively manages customer engagement to maximize r (ROI).',
          'His Team Maintain a strong ratio of approved customers versus rejected ones.',
          'His Ensures appropriate pharmacy coverage within the territory.'
        ]
      }
    ]
  },
  {
    id: 'dm_patient_first',
    title: '2. Patient First',
    rows: [
      {
        key: 'quality_of_call',
        competency: 'Quality of call',
        points: [
          'His Team Follows professional call steps (AVS Selling Module).',
          'His Team deivers product message efficitvly (stakeholders feedback).',
          'Message Recall Scrores.'
        ]
      },
      {
        key: 'customer_centricity',
        competency: 'Customer Centricity',
        points: [
          'Expands the customer base by engaging new customers and adding new hospitals or contracts.',
          'Resolves issues with previously closed customers.',
          'His team coverage and visit frequency.'
        ]
      }
    ]
  },
  {
    id: 'dm_transparent_honest',
    title: '3. Transparent & Honest',
    rows: [
      {
        key: 'discipline',
        competency: 'Discipline',
        points: [
          'Completes tasks on time with high quality.',
          'Attends meetings and submits coaching reports accurately and on time.',
          'His team Complete tasks on time with high quality.'
        ]
      },
      {
        key: 'work_ethics',
        competency: 'Work Ethics',
        points: [
          'Promotes ethical behavior and provides guidance and support to others in handling ethical challenges.',
          'Maintains a strong compliance record with no disciplinary actions.'
        ]
      }
    ]
  },
  {
    id: 'dm_fairness_respect_dignity',
    title: '4. Fairness, Respect & Dignity',
    rows: [
      {
        key: 'communication_skills',
        competency: 'Communication skills',
        points: [
          'Communicates with Direct Manager, Subordenates, colleagues & other department effectively.'
        ]
      },
      {
        key: 'leadership',
        competency: 'Leadership',
        points: [
          'Number of promoted colleagues.',
          'Volunty Turnover.',
          'Time to hire (less than 40 day).'
        ]
      },
      {
        key: 'impact',
        competency: 'Impact',
        points: [
          'Maintains his formal look & his team formal and professional appearance and confident body language in Field visits & work activities.'
        ]
      }
    ]
  },
  {
    id: 'dm_flexible_agile',
    title: '5. Flexible & Agile',
    rows: [
      {
        key: 'versatility',
        competency: 'Versatility',
        points: [
          'Adjusts leadership style to suit different teams, markets, or challenges.',
          'Builds rapport with different personality types and stakeholders.',
          'Maintains performance under pressure or during change.'
        ]
      },
      {
        key: 'market_competitors_feedback',
        competency: 'Market & Competitors Feedback',
        points: [
          'His Collects dynamic market and competitor feedback, including activities, pricing, structure, and campaigns, and shares with the direct manager and product manager.'
        ]
      },
      {
        key: 'self_awareness_development',
        competency: 'Self Awareness & Self development',
        points: [
          'Demonstrates awareness of personal strengths and development areas.',
          'Actively attends learning courses during the year (online or offline) and shares progress with the direct manager.',
          'Encourage his team to attends learning courses.'
        ]
      }
    ]
  }
];

function getAllDmItemKeys() {
  return DM_APPRAISAL_SECTIONS.flatMap(section => section.rows.map(row => row.key));
}

module.exports = {
  DM_APPRAISAL_SECTIONS,
  getAllDmItemKeys
};
