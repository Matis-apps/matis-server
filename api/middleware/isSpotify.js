const https = require('https');
const qs = require('querystring');
const utils = require('../../utils');
const User = require('mongoose').model('User');

module.exports.isSpotify = async (req, res, next) => {
  if (req.user) {
    if (req.user._id && req.user.spotify && req.user.spotify.token) {
      if (req.user.spotify.token.refresh_token) {
        await refreshSpotify(req.user._id, req.user.spotify.token.refresh_token)
          .then(spotify_user => {
            req.spotify_id = spotify_user.account.id;
            req.spotify_token = spotify_user.token.access_token;
            next()
          })
          .catch(err => next(utils.error(err, 500)))
      } else {
        next(utils.error("Can't acess user info", 500))
      }
    } else {
      next(utils.error("No spotify account", 403))
    }
  } else {
    next(utils.error("No account", 401))
  }
}

function refreshSpotify(_id, refresh_token) {
  return new Promise(async (resolve, reject) => {

    const requestBody = qs.stringify({
      grant_type: 'refresh_token',
      refresh_token: refresh_token,
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
               await saveSpotify(_id, json)
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

function saveSpotify(_id, json) {
  return new Promise(async (resolve, reject) => {
    const query = { _id: _id };
    const update = {
      "spotify.token.access_token": json.access_token,
      "spotify.token.expires_in": json.expires_in,
      "spotify.token.scope": json.scope,
    };
    const options = { new: true, upsert: true, useFindAndModify: false };
    await User.findOneAndUpdate(query, update, options)
      .then((user) => {
        resolve(user)
      })
      .catch(err => reject(utils.error(err, 500)));
  })
}