const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { fromBuffer } = require('file-type');

function createValidatedUpload({ destination, allowedExtensions, allowedMimeTypes, message }) {
  const invalidFileError = () => {
    const error = new Error(message);
    error.code = 'INVALID_FILE_TYPE';
    return error;
  };
  const storage = multer.memoryStorage();
  const mimePattern = new RegExp(`^(${[...allowedMimeTypes].map(mime => mime.replace('/', '\\/')).join('|')})$`);
  const extensionToType = {
    '.jpg': 'jpg',
    '.jpeg': 'jpg',
    '.png': 'png',
    '.gif': 'gif',
    '.pdf': 'pdf'
  };

  const fileFilter = (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.has(extension) && mimePattern.test(file.mimetype)) return cb(null, true);
    return cb(invalidFileError());
  };

  const parser = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter
  });

  const validateAndStore = async (req, res, next) => {
    try {
      const files = req.file ? [req.file] : (req.files || []);
      const validatedFiles = [];
      for (const file of files) {
        const detected = await fromBuffer(file.buffer);
        const expectedType = extensionToType[path.extname(file.originalname).toLowerCase()];
        if (!detected || detected.ext !== expectedType || !allowedMimeTypes.has(detected.mime)) {
          return next(invalidFileError());
        }

        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        file.filename = uniqueSuffix + path.extname(file.originalname).toLowerCase();
        validatedFiles.push(file);
      }

      fs.mkdirSync(destination, { recursive: true });
      for (const file of validatedFiles) {
        file.path = path.join(destination, file.filename);
        fs.writeFileSync(file.path, file.buffer);
        delete file.buffer;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };

  return {
    array: field => (req, res, next) => parser.array(field)(req, res, err => {
      if (err) return next(err);
      return validateAndStore(req, res, next);
    }),
    single: field => (req, res, next) => parser.single(field)(req, res, err => {
      if (err) return next(err);
      return validateAndStore(req, res, next);
    })
  };
}

module.exports = createValidatedUpload;
