const utils = require('../../utils');

module.exports.isDeezer = (req, res, next) => {
  if (req.user) {
    if (req.user.deezer) {
      if (req.user.deezer.account.id && req.user.deezer.token.access_token) {
        req.deezer_id = req.user.deezer.account.id;
        req.deezer_token = req.user.deezer.token.access_token;
        next()
      } else {
        next(utils.error("Can't acess user info", 500))
      }
    } else {
      next(utils.error("No deezer account", 403))
    }
  } else {
    next(utils.error("No account", 401))
  }
}