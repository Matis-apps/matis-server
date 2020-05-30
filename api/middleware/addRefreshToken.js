const utils = require('../../utils');

module.exports.addRefreshToken = (req, res, next) => {
  if (req.user) {
    if (req.user.refresh_token) {
      res.cookie('refresh_token', req.user.refresh_token, {
        maxAge: 86_400_000,
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