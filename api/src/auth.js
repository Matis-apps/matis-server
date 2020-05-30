const utils = require('../../utils');
const User = require('mongoose').model('User');
var randtoken = require('rand-token') 

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
          // Function defined at bottom of app.js
          const isValid = utils.validPassword(req.body.password, user.hash, user.salt);
          if (isValid) {
            const jwt = utils.issueJWT(user);
            resolve(formatResponse(jwt, user))
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
          var generatedRefreshToken = randtoken.uid(256) 
          
          const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            hash: hash,
            salt: salt,
            refresh_token: generatedRefreshToken,
            register_date: new Date(),
          });

          try {
            newUser.save()
              .then((user) => {
                const jwt = utils.issueJWT(user);
                const access_token = jwt.token;
                const expires = jwt.expires;
                const refresh_token = user.refresh_token;
                resolve(formatResponse(jwt, user))
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

function token(req) {
  return new Promise( async (resolve, reject) => {
    if (!req.body.refresh_token) {
      reject(utils.error("Missing parameters", 400))
    } else {
      var refresh_token = req.body.refresh_token;
      try {
        const findUser = await User.findOne({ refresh_token: req.body.refresh_token });
        if (!findUser) {
          reject(utils.error("Could not find the user", 403))
        } else {
          const jwt = utils.issueJWT(findUser);
          resolve(formatResponse(jwt, findUser));
        }
      } catch (error) {
        reject(utils.error(error, 500))
      }
    }
  })
}

function formatResponse(jwt, user) {
  const access_token = jwt.token;
  const expires = jwt.expires;
  const refresh_token = user.refresh_token;

  return { access_token, refresh_token, expires };
}

exports.login = login;
exports.register = register;
exports.token = token;
