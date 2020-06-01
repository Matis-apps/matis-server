const utils = require('../../utils');
const User = require('mongoose').model('User');
var randtoken = require('rand-token');
var cookieParser = require('cookie-parser');

function login(req) {
  return new Promise( async (resolve, reject) => {
    if (!req.body || !req.body.email || !req.body.password) {
      reject(utils.error("Missing parameters", 400))
    }

    await User.findOne({ email: req.body.email })
      .then((user) => {
        if (!user) {
          reject(utils.error("Could not find the user", 403))
        } else {
          const isValid = utils.validPassword(req.body.password, user.hash, user.salt);
          if (isValid) {
            resolve(formatUserAuth(user));
          } else {
            reject(utils.error("Wrong password", 401))
          }
        }
      })
      .catch((error) => {
        reject(utils.error(error, 500))
      });
  })
}

function register(req) {
  return new Promise( async (resolve, reject) => {
    if (!req.body || !req.body.name || !req.body.email || !req.body.password) {
      reject(utils.error("Missing parameters", 400))
    } else {
      const saltHash = utils.genPassword(req.body.password);
      const salt = saltHash.salt;
      const hash = saltHash.hash;

      try {
        const findUser = await User.findOne({ email: req.body.email });
        if(findUser) {
          reject(utils.error("User already exists", 401))
        } else {
          const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            hash: hash,
            salt: salt,
            register_date: new Date(),
          });

          try {
            newUser.save()
              .then((user) => {
                resolve(formatUserAuth(user));
              });
          } catch (error) {
            reject(utils.error(error, 500))
          }
        }
      } catch (error) {
        reject(utils.error(error, 500))
      }
    }
  })
}

function token(req, refresh_token) {
  return new Promise( async (resolve, reject) => {
    if (!refresh_token) {
      reject(utils.error("Missing parameters", 400))
    } else {
      let user = req.user;
      if (!user) {
        reject(utils.error("No user found", 400))
      } else {
        try {
          resolve(formatUserAuth(user));
        } catch (error) {
          reject(utils.error(error, 500))
        }
      }
    }
  })
}

function formatUserAuth(user) {
  const access_token = utils.issueJWTAccessToken(user);
  const refresh_token = utils.issueJWTRefreshToken(user);
  var has = [];
  if (user.deezer) {
    has.push('Deezer');
  }
  if (user.spotify) {
    has.push('Spotify');
  }
  return { access_token, refresh_token, has };
}

exports.login = login;
exports.register = register;
exports.token = token;
