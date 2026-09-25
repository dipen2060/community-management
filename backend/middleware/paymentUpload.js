const path = require('path');
const createValidatedUpload = require('./validatedUpload');

module.exports = createValidatedUpload({
  destination: path.join(__dirname, '..', 'uploads', 'payment-proofs'),
  allowedExtensions: new Set(['.jpeg', '.jpg', '.png', '.pdf']),
  allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'application/pdf']),
  message: 'Only JPG, PNG and PDF payment proofs are allowed'
});
