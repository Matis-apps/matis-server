const http = require('http');
const sleep = require('await-sleep');
const merror = require('../../merror');

const call_limit = 10; // Limit of items to retrieve

/**
 * httpCall return the artists grouped due to pagination. The function can be used recursively.
 * @params integer index offset for the pagination
 * @params integer retry count the number of retries allowed after an error
 */
const httpCall = async function(options) {
  return new Promise((resolve, reject) => {
    var req = http.get(options, response => {
      if (response.statusCode === 200) {
        // Event when receive the data
        var responseBody = "";
        response.on('data', function(chunck) { responseBody += chunck });

        // Event when the request is ending
        response.on('end', () => {
          try {
            let json = JSON.parse(responseBody)
            if (!json) {
              reject(merror.error("Unvalid json", 500));
            } else if (json.error) {
              reject(merror.error(json.error.message, json.error.code));
            } else { 
              resolve(json)
            }
          } catch(e) {
            reject(merror.error(e.message, 500));
          }
        })
      } else {
        reject(merror.error(e.message, response.statusCode));
      }
    }).on('error', function(e) {
      reject(merror.error(e.message, 500));
    });
  })
}

/**
 * getArtists Return the artists loved by a user
 * @params user_id
 * @params access_token
 */
async function getArtists(user_id = 'me', access_token = null) {

  var artists = [];
  var callError;
  var index = 0;
  var retry = 10;
  var total = 0;
  
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/user/'+user_id+'/artists?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
        if (retry === 0) { // if the retry is over
          index+=call_limit;
          retry=10;
        }
      });

    if(call) {
      const call = await httpCall(options); // await for the response
      Array.prototype.push.apply(artists, call.data); // push the data in the response
      total = call.total; // retrieve the total
      index+=call_limit; // goto the next page
      retry=10;
    } else {
      await sleep(1500);
    }
  } while (total > index); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (artists.length > 0) {
      resolve(artists);
    } else {
      reject(callError);
    }
  })
}

/**
 * getArtists Return the artists loved by a user
 * @params user_id
 * @params access_token
 */
async function getArtist(id) {

  var artist;
  var callError;
  var retry = 10;

  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/artist/'+id,
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

    const call = await httpCall(options) // await for the response
      .catch(err => { // catch if error
        callError = err;
        retry--;
      });

    if(call) {
      artist = call; // push the data in the response
    } else {
      await sleep(1500);
    }
  } while (!artist && retry > 0); // loop while there is another page
  
  if (artist) {
    var retry = 10;

    do {
      const options = {
          hostname: 'api.deezer.com',
          path: '/artist/'+id+'/albums',
          method: 'GET',
          headers: {
            'content-type': 'text/json'
          },
        };
  
      const call = await httpCall(options) // await for the response
        .catch(err => { // catch if error
          callError = err;
          retry--;
        });
  
      if(call) {
        artist.albums = call; // push the data in the response
      } else {
        await sleep(1500);
      }
    } while (!artist.albums && retry > 0); // loop while there is another page
  }
  
  return new Promise((resolve, reject) => {
    if (artist) {
      resolve(artist);
    } else {
      reject(callError);
    }
  })
}


/**
 * getPlaylists Return the playlists loved by a user
 * @params user_id
 * @params access_token
 */
async function getPlaylists(user_id = 'me', access_token = null) {

  var playlists = [];
  var callError;
  var index = 0;
  var retry = 10;
  var total = 0;
  
  do {
    // Configuration of the http request
    const options = {
      hostname: 'api.deezer.com',
      path: '/user/'+user_id+'/playlists?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
      method: 'GET',
      headers: {
        'content-type': 'text/json'
      },
    };

    const call = await httpCall(options)// await for the response
      .catch(err => {
        callError = err;
        retry--;
        if (retry === 0) {
          index+=call_limit;
          retry=10;
        }
      });

    if (call) {
      Array.prototype.push.apply(playlists, call.data); // push the data in the response
      total = call.total; // retrieve the total
      index+=call_limit; // goto the next page
      retry=10;
    }
  } while (total > index); // loop while there is another page



  return new Promise((resolve, reject) => {
    if (playlists.length > 0) {
      resolve(playlists);
    } else {
      reject(callError);
    }
  })
}


exports.getArtist = getArtist;
exports.getArtists = getArtists;
exports.getPlaylists = getPlaylists;