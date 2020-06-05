const utils = require('../../utils');

module.exports = (req, res, next) => {
  let refresh_token = req.cookies.refresh_token;

  if (refresh_token) {
    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
    });
  } else {
    //
  }
  next()
}