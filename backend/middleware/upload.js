const path = require('path');
const createValidatedUpload = require('./validatedUpload');

module.exports = createValidatedUpload({
  destination: path.join(__dirname, '..', 'uploads'),
  allowedExtensions: new Set(['.jpg', '.jpeg', '.png', '.gif', '.pdf']),
  allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'image/gif', 'application/pdf']),
  message: 'Only images (JPEG, JPG, PNG, GIF) and PDF files are allowed'
});
