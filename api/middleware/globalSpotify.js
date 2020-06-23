const https = require('https');
const qs = require('querystring');
const utils = require('../../utils');
const Config = require('mongoose').model('Config');
const User = require('mongoose').model('User');

const access_key = 'spotify_access_token';
const refresh_key = 'spotify_refresh_token';
const expires_key = 'spotify_expires_token';

module.exports = async (req, res, next) => {
  var access_token, refresh_token;

  try {
    let conf1 = await Config.findOne({key: access_key});
    let conf2 = await Config.findOne({key: refresh_key});

    access_token = conf1.value;
    refresh_token = conf2.value;

  } catch(err) {
    next(utils.error(err, 500))
  }

  if (access_token && refresh_token) {
    req.spotify_id = -1;
    req.spotify_username = 'Matis';
    req.spotify_token = access_token; // By default

    await refreshSpotify(refresh_token)
      .then(config => {
        req.spotify_token = config.value;
        next();
      })
      .catch(err => next()) // Do next anyway as the original access_token as been set above
  } else {
    next(utils.error("No config found", 500))
  }
}

function refreshSpotify(refresh_token) {
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
               await saveConfig(json)
                .then(config => resolve(config))
                .catch(err => reject(err.message, 500))
            } else if (json.error) {
              reject(utils.error(json.error, response.statusCode));
            } else {
              reject(utils.error("Something went wrong...", 500));
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

function saveConfig(json) {
  return new Promise(async (resolve, reject) => {
    try {
      if (json.refresh_token) {
        await updateConfig(refresh_key, json.refresh_token);
      }
      if(json.expires_in) {
        await updateConfig(expires_key, json.expires_in);
      }
      if (json.access_token) {
        let config_token = await updateConfig(access_key, json.access_token);
        resolve(config_token)
      }
    }
    catch (err) {
      reject(utils.error(err, 500))
    }
  })
}

function updateConfig(key, value) {
  const query = { 'key': key };
  const update = { 'value': value };
  const options = { new: true, upsert: true, useFindAndModify: false };

  return Config.findOneAndUpdate(query, update, options);
}
