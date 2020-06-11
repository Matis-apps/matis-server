const utils = require('../../utils');

module.exports = (req, res, next) => {
  if (req.user) {
    if (req.user.discogs && req.user.discogs.account && req.user.discogs.token) {
      if (req.user.discogs.account.name && req.user.discogs.token.oauth_token && req.user.discogs.token.oauth_token_secret) {
        req.discogs_name = req.user.discogs.account.username;
        req.discogs_token = req.user.discogs.token.oauth_token;
        req.discogs_secret = req.user.discogs.token.oauth_token_secret;
        next()
      } else {
        next(utils.error("Can't acess user info", 500))
      }
    } else {
      next(utils.error("No Discogs account", 403))
    }
  } else {
    next(utils.error("No account", 401))
  }
}