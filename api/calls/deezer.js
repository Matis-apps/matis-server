const http = require('http');
const sleep = require('await-sleep');
const merror = require('../../merror');

const call_limit = 100; // Limit of items to retrieve

/**
 * httpCall Call the API end parse de response
 * @params options
 */
const httpCall = async function(options) {
  return new Promise((resolve, reject) => {
    var req = http.get(options, response => {
      if (response.statusCode === 200) {
        // Event when receiving the data
        var responseBody = "";
        response.on('data', function(chunck) { responseBody += chunck });

        // Event when the request is ending
        response.on('end', () => {
          try {
            let json = JSON.parse(responseBody)
            if (!json) { // json is undefined or null
              reject(merror.error("Unvalid json", 500));
            } else if (json.error) { // json has an error (set by Deezer)
              reject(merror.error(json.error.message, json.error.code));
            } else { // otherwise, json is ok
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
    
  return new Promise((resolve, reject) => {
    /**
     * recursive Fill the artists array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = 10) {
      // Configuration of the http request
      const options = {
        hostname: 'api.deezer.com',
        path: '/user/'+user_id+'/artists?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(artists, response.data)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(artists)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(artists);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 429) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, 1500, index, retry-1);
          } else {
            if(artists.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(err);              
            } else { // otherwise, best-effort mode
              resolve(artists);
            }
          }
        });
    };

    recursive()
  });
}

/**
 * getArtist Return the artist content with its albums
 * @params id
 */
async function getArtist(id) {

  var artist;
  var callError;
  var retry = 10;

  // get the general data of the artist
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
  
  // get the albums of the artist
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
  
  return new Promise((resolve, reject) => {
    /**
     * recursive Fill the playlists array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = 10) {
      // Configuration of the http request
      const options = {
        hostname: 'api.deezer.com',
        path: '/user/'+user_id+'/playlists?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(playlists, response.data)
          if(response.next) {
            recursive(index+call_limit)
              .catch(() => resolve(playlists)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(playlists);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 429) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, 1500, index, retry-1);
          } else {
            if(playlists.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(err);              
            } else { // otherwise, best-effort mode
              resolve(playlists);
            }
          }
        });
    };

    recursive()
  });
}


exports.getArtist = getArtist;
exports.getArtists = getArtists;
exports.getPlaylists = getPlaylists;