const https = require('https');
const sleep = require('await-sleep');
const moment = require('moment');
const utils = require('../../utils');

const call_limit = 100; // Limit of items to retrieve
const retry_limit = 8; // Limit number of retry
const retry_timeout = 1800; // Limit number of retry

/**
 * httpsCall Call the API end parse de response
 * @params options
 */
const httpsCall = async function(options) {
  return new Promise((resolve, reject) => {
    var req = https.get(options, response => {
      // Event when receiving the data
      var responseBody = "";
      response.on('data', function(chunck) { responseBody += chunck });

      // Event when the request is ending
      response.on('end', () => {
        if (response.statusCode === 200) {
          try {
            let json = JSON.parse(responseBody)

            if (!json) { // json is undefined or null
              reject(utils.error("Unvalid json", 500));
            } else if (json.error) { // json has an error (set by Deezer)
              reject(utils.error(json.error.message, json.error.code));
            } else { // otherwise, json is ok
              resolve(json)
            }
          } catch(e) {
            reject(utils.error(e.message, 500));
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

async function getMeAccount(access_token) {
  var me;
  var callError;
  var retry = retry_limit;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.spotify.com',
        path: '/v1/me',
        method: 'GET',
        headers: {
          'Authorization': 'Bearer '+access_token,
          'content-type': 'text/json'
        },
      };

    const call = await httpsCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      me = call;
    } else {
      await sleep(retry_timeout);
    }
  } while (!me && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (!me) {
      reject(utils.error("No content"), 200);
    } else {
      resolve(formatUserToStandard(me))
    }
  })
}

function formatUserToStandard(user){
  return {
    _obj: 'user',
    _uid: 'spotify-'+user.type+'-'+user.id,
    // Related to the author
    id: user.id,
    name: user.display_name,
    profile: user.external_urls.spotify,
    fullname: null,
    picture: user.images[0] ? user.images[0].url : null,
  };
}

exports.getMeAccount = getMeAccount;
