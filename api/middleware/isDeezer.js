const utils = require('../../utils');

module.exports.isDeezer = (req, res, next) => {
  if (req.user) {
    if (req.user.deezer) {
      next()
    } else {
      res.status(403).json({error: utils.error("No deezer account", 403)})
    }
  } else {
    res.status(401).json({ error: utils.error("No account", 401)})
  }
}