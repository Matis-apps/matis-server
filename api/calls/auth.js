const utils = require('../../utils');
const User = require('mongoose').model('User');

function login(req) {
  return new Promise( async (resolve, reject) => {
    if (!req.body || !req.body.email || !req.body.password) {
      reject(utils.error("Missing parameters", 400))
    }

    await User.findOne({ email: req.body.email })
      .then((user) => {
      
        if (!user) {
          reject(utils.error("Could not find the user", 403))
        }
              
        // Function defined at bottom of app.js
        const isValid = utils.validPassword(req.body.password, user.hash, user.salt);
                
        if (isValid) {
          const jwt = utils.issueJWT(user);
          resolve(jwt)
        } else {
          reject(utils.error("Wrong password", 401))
        }
      })
      .catch((err) => {
        reject(utils.error(err, 500))
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
              const jwt = utils.issueJWT(user)
              resolve(jwt)
            });
        } catch (err) {
          reject(utils.error(err, 500))
        }
      }
    }
  })
}

exports.login = login;
exports.register = register;
