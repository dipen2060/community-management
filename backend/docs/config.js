const isDocsEnabled = () => {
  const flag = process.env.ENABLE_API_DOCS;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
};

module.exports = { isDocsEnabled };
