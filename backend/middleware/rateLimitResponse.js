function rateLimitResponse(req, res) {
  const resetTime = req.rateLimit?.resetTime;
  const resetAt = resetTime instanceof Date ? resetTime.getTime() : Date.now() + (15 * 60 * 1000);
  const minutes = Math.max(1, Math.ceil((resetAt - Date.now()) / 60000));

  return res.status(429).json({
    success: false,
    message: `Too many attempts. Please try again in ${minutes} minutes.`,
    code: 'RATE_LIMITED'
  });
}

module.exports = { rateLimitResponse };
