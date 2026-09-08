const multer = require('multer');
const path = require('path');
const fs = require('fs');

const proofDir = path.join(__dirname, '..', 'uploads', 'payment-proofs');
if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(proofDir)) fs.mkdirSync(proofDir, { recursive: true });
    cb(null, proofDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const allowedExtensions = new Set(['.jpeg', '.jpg', '.png', '.pdf']);

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.has(ext) && allowedMimeTypes.has(file.mimetype)) return cb(null, true);
  return cb(new Error('Only JPG, PNG and PDF payment proofs are allowed'));
};

module.exports = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter
});
