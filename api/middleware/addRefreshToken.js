const utils = require('../../utils');

module.exports.addRefreshToken = (req, res, next) => {
  if (req.user) {
    if (req.user.refresh_token) {
      res.cookie('refresh_token', req.user.refresh_token, {
        maxAge: 24 * 60 * 60 * 1000 * 14, // 14 days
        httpOnly: true
      });
    } else {
      //
    }
  } else {
    //
  }
  next()
}