const https = require('https');
const utils = require('../../utils');
const User = require('mongoose').model('User');

function me(req) {
  return new Promise((resolve, reject) => {
    resolve({
      'name': req.user.name,
      'email': req.user.email,
      'deezer': req.user.deezer,
    })
  })
}

function accounts(req) {
}


function registerDeezer(req, code) {
  return new Promise(async (resolve, reject) => {

    const host = "https://connect.deezer.com";
    const path = "/oauth/access_token.php?app_id="+ process.env.VUE_APP_DEEZER_APP_ID +"&secret="+ process.env.VUE_APP_DEEZER_SECRET +"&code=" + code + "&output=json";
    
    await https.get(host + path, response => {
      // Event when receiving the data
      var responseBody = "";
      response.on('data', function(chunck) { responseBody += chunck });

      // Event when the request is ending
      response.on('end', async () => {

        if (response.statusCode === 200) {
          try {

            let json = JSON.parse(responseBody)
            if (!json) { // json is undefined or null
              reject(utils.error("Unvalid json", 500));
            } else if (json.error) { // json has an error (set by Deezer)
              reject(utils.error(json.error.message, json.error.code));
            } else { // otherwise, json is ok
              await saveDeezer(req, json)
                .then(user => resolve(user.deezer))
                .catch(err => reject(err.message, 500))
            }
          } catch(e) {
            if (responseBody) {
              reject(utils.error(responseBody, 401));
            } else {
              reject(utils.error(e.message, 500));
            }
          }
        } else {
          reject(utils.error(response, response.statusCode));
        }
      })
    }).on('error', function(e) {
      reject(utils.error(e.message, 500));
    });
  })
}

function saveDeezer(req, json) {
  return new Promise(async (resolve, reject) => {

    const query = { _id: req.user._id };
    const update = { deezer: json };
    const options = { new: true, upsert: true };

    await User.findOneAndUpdate(query, update, options)
      .then((user) => {
        resolve(user)
      })
      .catch(err => reject(utils.error(err, 500)));
  })
}

exports.me = me;
exports.accounts = accounts;
exports.registerDeezer = registerDeezer;

