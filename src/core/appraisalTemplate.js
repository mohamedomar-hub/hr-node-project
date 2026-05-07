const APPRAISAL_SECTIONS = [
  {
    id: 'compete_lead_succeed',
    title: '1. Compete to Lead & Succeed',
    rows: [
      {
        key: 'territory_knowledge',
        competency: 'Territory Knowledge',
        points: [
          'Demonstrates a strong understanding of the assigned territory, including area type, key doctors, key accounts, and related contracts.'
        ]
      },
      {
        key: 'planning_time_management',
        competency: 'Planning & Time Management',
        points: [
          'Plans visits effectively and adheres to the planned schedule.',
          'Prioritizes tasks based on importance, urgency, and long-term objectives.'
        ]
      },
      {
        key: 'commercial_practice',
        competency: 'Commericial Practice',
        points: [
          'Effectively manages customer engagement to maximize r (ROI).',
          'Maintains a strong ratio of approved customers versus rejected ones.',
          'Ensures appropriate pharmacy coverage within the territory.'
        ]
      }
    ]
  },
  {
    id: 'patient_first',
    title: '2. Patient First',
    rows: [
      {
        key: 'quality_of_call',
        competency: 'Quality of call',
        points: [
          'Follows professional call steps (AVS Selling Module).',
          'Achieves high scores in coaching reports.'
        ]
      },
      {
        key: 'customer_centricity',
        competency: 'Customer Centricity',
        points: [
          'Expands the customer base by engaging new customers and adding new hospitals or contracts.',
          'Resolves issues with previously closed customers.',
          'Ensures appropriate coverage and visit frequency.'
        ]
      }
    ]
  },
  {
    id: 'transparent_honest',
    title: '3. Transparent & Honest',
    rows: [
      {
        key: 'discipline',
        competency: 'Discipline',
        points: [
          'Completes tasks on time with high quality.',
          'Attends meetings and submits visit reports accurately and on time.'
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
    id: 'fairness_respect_dignity',
    title: '4. Fairness, Respect & Dignity',
    rows: [
      {
        key: 'communication_skills',
        competency: 'Communication skills',
        points: [
          'Communicates effectively with the direct manager and colleagues.',
          'Presents ideas clearly and in an organized manner.',
          'Adapts communication style appropriately to different audiences, including customers.'
        ]
      },
      {
        key: 'impact',
        competency: 'Impact',
        points: [
          'Maintains a formal and professional appearance during visits.',
          'Demonstrates confident body language.'
        ]
      }
    ]
  },
  {
    id: 'flexible_agile',
    title: '5. Flexible & Agile',
    rows: [
      {
        key: 'market_competitors_feedback',
        competency: 'Market & Competitors Feedback',
        points: [
          'Collects dynamic market and competitor feedback, including activities, pricing, structure, and campaigns, and shares with the direct manager and product manager.'
        ]
      },
      {
        key: 'self_awareness_development',
        competency: 'Self Awareness & Self development',
        points: [
          'Demonstrates awareness of personal strengths and development areas.',
          'Actively attends learning courses during the year (online or offline) and shares progress with the direct manager.'
        ]
      }
    ]
  }
];

function getAllItemKeys() {
  return APPRAISAL_SECTIONS.flatMap(section => section.rows.map(row => row.key));
}

module.exports = {
  APPRAISAL_SECTIONS,
  getAllItemKeys
};
