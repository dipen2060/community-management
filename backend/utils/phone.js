const NEPAL_MOBILE_PREFIXES = [
  '980',
  '981',
  '982',
  '984',
  '985',
  '986',
  '970',
  '971',
  '974',
  '975',
  '976'
];

const normalizeNepalPhone = (input) => {
  if (typeof input !== 'string') {
    return null;
  }

  let phone = input.replace(/[\s\-()]/g, '');

  if (phone.startsWith('+977') && /^\d{10}$/.test(phone.slice(4))) {
    phone = phone.slice(4);
  } else if (phone.startsWith('977') && /^\d{10}$/.test(phone.slice(3))) {
    phone = phone.slice(3);
  }

  return /^\d{10}$/.test(phone) ? phone : null;
};

const isValidNepalMobile = (input) => {
  const phone = normalizeNepalPhone(input);
  return phone !== null && NEPAL_MOBILE_PREFIXES.includes(phone.slice(0, 3));
};

module.exports = {
  NEPAL_MOBILE_PREFIXES,
  normalizeNepalPhone,
  isValidNepalMobile
};
