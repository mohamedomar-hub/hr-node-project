const { DM_APPRAISAL_SECTIONS } = require('./dmAppraisalTemplate');

const AM_APPRAISAL_SECTIONS = DM_APPRAISAL_SECTIONS.map(section => ({
  ...section,
  id: section.id.replace(/^dm_/, 'am_'),
  rows: section.rows.map(row => ({ ...row, points: [...row.points] }))
}));

function getAllAmItemKeys() {
  return AM_APPRAISAL_SECTIONS.flatMap(section => section.rows.map(row => row.key));
}

module.exports = {
  AM_APPRAISAL_SECTIONS,
  getAllAmItemKeys
};
