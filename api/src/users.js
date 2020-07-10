const https = require('https');
const utils = require('../../utils');
const qs = require('querystring');
const User = require('mongoose').model('User');
const deezerMe = require('./deezer').getMeAccount;
const spotifyMe = require('./spotify').getMeAccount;
const discogsIdentity = require('./discogs').getIdentity;
const discogsMe = require('./discogs').getMeAccount;

function me(req) {
  return new Promise((resolve, reject) => {
    const user = req.user;

    var has = [];
    if (user.deezer) {
      has.push('Deezer');
    }
    if (user.spotify) {
      has.push('Spotify');
    }
    if (user.discogs) {
      has.push('Discogs');
    }

    resolve ({
      'user': {
        'name': user.name,
        'email': user.email,
        'deezer': user.deezer,
        'spotify': user.spotify,
        'discogs': user.discogs,
      },
      'has': has
    })
  })
}

////////////
// DEEZER //
////////////
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

/////////////
// SPOTIFY //
/////////////
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

/////////////
// DISCOGS //
/////////////
function requestTokenDiscogs(req) {
  return new Promise((resolve, reject) => {

    let timestamp = Math.floor(Date.now() / 1000);
    const authorizationHeader = {
      oauth_consumer_key: process.env.DISCOGS_CLIENT_ID,
      oauth_nonce: 'ABC' + timestamp,
      oauth_signature: process.env.DISCOGS_CLIENT_SECRET + '&',
      oauth_signature_method: 'PLAINTEXT',
      oauth_timestamp: timestamp,
      oauth_callback: req.headers.origin + '/account?from=discogs',
    }

    const options = {
      hostname: 'api.discogs.com',
      path: '/oauth/request_token',
      method: 'GET',
      headers: {
        'Authorization': 'OAuth ' + Object.keys(authorizationHeader).map(k => k + '=' + authorizationHeader[k]).join(','),
        'User-Agent': 'API/Matis'
      },
    };

    const request = https.request(options, response => {
      // Event when receiving the data
      var responseBody = "";
      response.on('data', function(chunck) { responseBody += chunck });

      // Event when the request is ending
      response.on('end', () => {
        if (response.statusCode === 200) {
          let discogsOAuthToken = responseBody.split('&')[0].split('=')[1];
          let discogsOAuthSecretToken = responseBody.split('&')[1].split('=')[1];
          saveTempDiscogsToken(req.user._id, discogsOAuthSecretToken)
            .then(() => resolve(discogsOAuthToken))
            .catch((err) => reject(err))
        } else {
          reject(utils.error(responseBody, response.statusCode));
        }
      })
    })

    request.on('error', (e) => {
      reject(utils.error(e.message, 500));
    });
    request.end();
  })
}

function saveTempDiscogsToken(id, token) {
  return new Promise(async (resolve, reject) => {
    const query = { _id: id };
    const update = { temp_discogs_oauth: token };
    const options = { new: true, upsert: true, useFindAndModify: false };

    await User.findOneAndUpdate(query, update, options)
      .then((user) => resolve())
      .catch(err => reject(utils.error(err, 500)));
  })
}

function registerDiscogs(req, token, verify) {
  return new Promise(async (resolve, reject) => {

    let timestamp = Math.floor(Date.now() / 1000);
    const authorizationHeader = {
      oauth_consumer_key: process.env.DISCOGS_CLIENT_ID,
      oauth_nonce: 'ABC' + timestamp,
      oauth_token: token,
      oauth_signature: process.env.DISCOGS_CLIENT_SECRET + '&' + req.user.temp_discogs_oauth,
      oauth_signature_method: 'PLAINTEXT',
      oauth_timestamp: timestamp,
      oauth_verifier: verify,
    }

    const options = {
      hostname: 'api.discogs.com',
      path: '/oauth/access_token',
      method: 'GET',
      headers: {
        'Authorization': 'OAuth ' + Object.keys(authorizationHeader).map(k => k + '=' + authorizationHeader[k]).join(','),
        'User-Agent': 'API/Matis'
      },
    };

    const request = https.request(options, response => {
      // Event when receiving the data
      var responseBody = "";
      response.on('data', function(chunck) { responseBody += chunck });

      // Event when the request is ending
      response.on('end', async () => {
        try {
          if (response.statusCode === 200) {
            let responseArray = responseBody.split('&');
            if (responseArray.length >= 2) {
              let oauth_token = responseArray[0].split('=')[1];
              let oauth_token_secret = responseArray[1].split('=')[1];
              await saveDiscogs(req.user._id, oauth_token, oauth_token_secret)
                .then(user => resolve(user.discogs))
                .catch(err => reject(err))
            } else {
              reject(utils.error("Invalid response from Discogs ", 500));
            }
          } else {
            reject(utils.error(responseBody, 500));
          }
        } catch (e) {
          reject(utils.error(e + " - " + responseBody, 500));
        }
      })
    })
    request.on('error', (e) => {
      reject(utils.error(e.message, 500));
    });
    request.end();
  })
}

function saveDiscogs(id, oauth_token, oauth_token_secret) {
  return new Promise(async (resolve, reject) => {
    try {
      const identity = await discogsIdentity(oauth_token, oauth_token_secret);
      const me = await discogsMe(oauth_token, oauth_token_secret, identity.username);

      if (me) {
        const query = { _id: id };
        const update = {
          discogs: {
            account: me,
            token: {oauth_token, oauth_token_secret},
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
    } catch (err) {
      reject(utils.error(err.message, 500));
    }
  })
}

async function addFollowingToUser(user, following) {
  const existingFollowing = user.follow.find(userFollowing => {
    return userFollowing._from === following._from && userFollowing.id === following.id
  });

  if (!existingFollowing) {
    const mongoUser = await User.findOne({_id: user._id});
    if (mongoUser) {
      mongoUser.follow.push(following)
      mongoUser.save();
      if (mongoUser.follow.map(f => f._uid).includes(following._uid)) {
        return mongoUser;
      } else {
        return Promise.reject(utils.error("Cannot save the new following", 500));
      }
    } else {
      return Promise.reject(utils.error("Cannot find the current user", 500));
    }
  } else {
    return Promise.reject(utils.error("The user already follow this guy", 409));
  }
}

async function getUserFollowing(user) {
  if (user == null) {
    return Promise.reject(utils.error("Cannot find the current user", 500));
  } else {
    return user.follow;
  }
}

exports.me = me;
exports.registerDeezer = registerDeezer;
exports.registerSpotify = registerSpotify;
exports.requestTokenDiscogs = requestTokenDiscogs;
exports.registerDiscogs = registerDiscogs;
exports.addFollowingToUser = addFollowingToUser;
exports.getUserFollowing = getUserFollowing;
