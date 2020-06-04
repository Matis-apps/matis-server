const https = require('https');
const utils = require('../../utils');
const qs = require('querystring');
const User = require('mongoose').model('User');
const deezerMe = require('./deezer').getMeAccount;
const spotifyMe = require('./spotify').getMeAccount;

function me(req) {
  return new Promise((resolve, reject) => {
    resolve({
      'name': req.user.name,
      'email': req.user.email,
      'deezer': req.user.deezer,
      'spotify': req.user.spotify,
    })
  })
}

function accounts(req) {

}


function registerDeezer(req, code) {
  return new Promise(async (resolve, reject) => {

    const host = "https://connect.deezer.com";
    const path = "/oauth/access_token.php?app_id="+ process.env.DEEZER_APP_ID +"&secret="+ process.env.DEEZER_SECRET +"&code=" + code + "&output=json";
    
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

    const me = await deezerMe(json.access_token);

    if (me) {
      const query = { _id: req.user._id };
      const update = { 
        deezer: {
          account: me,
          token: json,
        } 
      };
      const options = { new: true, upsert: true, useFindAndModify: false };

      await User.findOneAndUpdate(query, update, options)
      .then((user) => {
        resolve(user)
      })
      .catch(err => reject(utils.error(err, 500)));
    } else {
      reject(utils.error("Can't retrieve deezer/user/me", 500))
    }
  })
}


function registerSpotify(req, code) {
  return new Promise(async (resolve, reject) => {

    const requestBody = qs.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: req.headers.origin + '/account?from=spotify',
    });

    const options = {
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID+':'+process.env.SPOTIFY_CLIENT_SECRET).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': requestBody.length
      },
    };

    const request = https.request(options, response => {
      // Event when receiving the data
      var responseBody = "";
      response.on('data', function(chunck) { responseBody += chunck });

      // Event when the request is ending
      response.on('end', async () => {
        try {
          let json = JSON.parse(responseBody)

          if (!json) {
            reject(utils.error("Unvalid json", 500));
          } else {
            if (response.statusCode === 200) {
               await saveSpotify(req, json)
                .then(user => resolve(user.spotify))
                .catch(err => reject(err.message, 500))
            } else if (json.error) {
              reject(utils.error(json.error, response.statusCode));
            } else {
              reject(utils.error("Something whent wrong...", 500));
            }
          }
        } catch (e) {
          reject(utils.error(e + " - " + responseBody, 500));
        }
      })
    })
    request.write(requestBody);
    request.on('error', (e) => {
      reject(utils.error(e.message, 500));
    });
    request.end();
  })
}

function saveSpotify(req, json) {
  return new Promise(async (resolve, reject) => {
    const me = await spotifyMe(json.access_token);
    if (me) {
      const query = { _id: req.user._id };
      const update = { 
        spotify: {
          account: me,
          token: json,
        } 
      };
      const options = { new: true, upsert: true, useFindAndModify: false };
      await User.findOneAndUpdate(query, update, options)
        .then((user) => {
          resolve(user)
        })
        .catch(err => reject(utils.error(err, 500)));
    } else {
      reject(utils.error("Can't retrieve spotify/user/me", 500))
    }
  })
}


exports.me = me;
exports.accounts = accounts;
exports.registerDeezer = registerDeezer;
exports.registerSpotify = registerSpotify;

