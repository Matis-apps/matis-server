const https = require('https');
const moment1 = require('moment');
const moment2 = require('moment-timezone');
const sleep = require('await-sleep');
const utils = require('../../utils');
const tool = require('./tool');
const DiscogsCollection = require('mongoose').model('DiscogsCollection');


const call_limit = 100; // Limit of items to retrieve
const retry_limit = 10; // Limit number of retry
const retry_timeout = 1800; // Limit number of retry

var stack_timeout = 0;
const stack_timeout_between = 1000;

const incrementStackTimeout = () => stack_timeout+=stack_timeout_between;
const decrementStackTimeout = () => stack_timeout = stack_timeout > stack_timeout_between ? stack_timeout-=stack_timeout_between : stack_timeout_between;
const clearStackTimeout = () => stack_timeout=0;

/**
 * httpsCall Call the API end parse de response
 * @params options
 */
const httpsCall = async function(options) {
  return new Promise((resolve, reject) => {
    incrementStackTimeout();
    let wait = setTimeout(() => {
      clearTimeout(wait);
      calling();
    }, stack_timeout)

    let calling = () => {
      console.info('** REQUEST ** : ' + options.hostname + options.path);
      https.get(options, response => {
        // Event when receiving the data
        var responseBody = "";
        response.on('data', function(chunck) { responseBody += chunck });

        // Event when the request is ending
        response.on('end', () => {
          //console.info('** RESPONSE ** : ' + options.hostname + options.path + ' : ' + response.statusCode + (responseBody ? ' => ' + responseBody.substr(0,50) + ' ...' : ''));
          try {
            let json = JSON.parse(responseBody)
            if (response.statusCode === 200) {
              if (!json) { // json is undefined or null
                reject(utils.error("Discogs : Unvalid json", 500));
              } else { // otherwise, json is ok
                decrementStackTimeout();
                resolve(json)
              }
            } else {
              if(json.message) {
                console.error('Discogs : ', json.message)                
                if (0 === response.headers['X-Discogs-Ratelimit-Remaining']) {
                  incrementStackTimeout();
                  reject(utils.error(json.message, 429));
                } else {
                  reject(utils.error("Discogs : " + json.message, response.statusCode));
                }
              } else {
                console.error('Discogs : Something went wrong...')
                reject(utils.error("Discogs : Something went wrong...", 500));
              }
            }
          } catch(err) {
            console.error(err)
            reject(utils.error("Discogs : " + err.message, 500));
          }
        })
      }).on('error', function(err) {
        console.error(err)
        reject(utils.error("Discogs : " + err.message, 500));
      });
    }
  })
}

function configureOptions(token, secret, path) {
  let timestamp = Math.floor(Date.now() / 1000);

  const authorizationHeader = {
    oauth_consumer_key: process.env.DISCOGS_CLIENT_ID,
    oauth_nonce: 'ABC' + timestamp,
    oauth_token: token,
    oauth_token_secret: secret, 
    oauth_signature: process.env.DISCOGS_CLIENT_SECRET + '&' + secret,
    oauth_signature_method: 'PLAINTEXT',
    oauth_timestamp: timestamp,
  }

  const options = {
    hostname: 'api.discogs.com',
    path: path,
    method: 'GET',
    headers: {
      'Authorization': 'OAuth ' + Object.keys(authorizationHeader).map(k => k + '=' + authorizationHeader[k]).join(','),
      'User-Agent': 'API/Matis'
    },
  };

  return options;
}

function genericHttps(token, secret, path) { // don't forget to call clearStackTimeout();
  return new Promise(async (resolve, reject) => {
    var result = null;
    var error = null;
    var retry = retry_limit;
    
    // get the general data of the artist
    do {
      let options = configureOptions(token, secret, path);
      try {
        result = await httpsCall(options) // await for the response
      } catch(err) {
        error = err;
        if(error.code == 429) retry-- && await sleep(retry_timeout);// code 429 == quota limit
        else retry = 0;
      }
    } while (!result && retry > 0); // loop while there is another page

    if (result) {
      resolve(result);
    } else if (error) {
      reject(error);
    } else {
      reject(utils.error("Something went wrong..."));
    }
  })
}

function recursiveHttps(token, secret, path) {
  return new Promise((resolve, reject) => {
    clearStackTimeout();
    var result = [];
    /**
     * recursive Fill the result array and handle the pagination recursively
     * @params page
     * @params retry
     */
    let recursive = async function (page = 1, retry = retry_limit) {
      // Configuration of the https request

      let recursivePath = path + 'page=' + page + '&per_page=' + call_limit;
      let options = configureOptions(token, secret, recursivePath);

      try {
        let response = await httpsCall(options);
        var itemMainKey = Object.keys(response).find(k => k != 'pagination');

        Array.prototype.push.apply(result, response[itemMainKey])
        if(response.pagination && response.pagination.page < response.pagination.pages) { // if has a next object, keep going
          recursive(page+1)
            .catch(() => resolve(result)); // resolve the iterations if an error happens
        } else { // no more page, resolve with the result
          resolve(result);
        }
      } catch(error) {
        if (retry > 0 && error.code == 429) { // too many request and still have a retry, so wait for a delay and get back
          setTimeout(recursive, retry_timeout, page, retry-1);
        } else {
          reject(utils.error(error.message || 'Something went wrong...', error.code || 500));
        }
      }
    };

    recursive()
  })
}

async function fetchReleaseDetails(token, secret, id) {
  return new Promise((resolve, reject) => {
    const path = '/releases/'+id;
    genericHttps(token, secret, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

//////////////
// SERVICES //
//////////////
async function getIdentity(token, secret) {
  return new Promise((resolve, reject) => {
    const path = '/oauth/identity';
    genericHttps(token, secret, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

async function getMeAccount(token, secret, username) {
  return new Promise((resolve, reject) => {
    const path = '/users/' + username;
    genericHttps(token, secret, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

async function getFolders(token, secret, username) {
  return new Promise((resolve, reject) => {
    const path = '/users/' + username + '/collection/folders';
    genericHttps(token, secret, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

async function getFolderItems(token, secret, username, id) {
  return new Promise((resolve, reject) => {
    const path = '/users/' + username + '/collection/folders/' + id + '/releases?';
    recursiveHttps(token, secret, path)
      .then(result => {
        result.sort((a,b) => sortReleases(a,b))
        return result;
      })
      .then(async (collection) => {
        var genres = [];
        if(collection && collection.length > 0) {
          const searchCollection = await DiscogsCollection.find({ 'discogs.album.id': collection.map(item => item.id) });
          console.log('==============');
          console.log(searchCollection);
          console.log('==============');

          // Creating the list of genres
          var availableGenres = [];
          collection.forEach(i => {
            Array.prototype.push.apply(availableGenres, i.basic_information.genres)
          })
          genres = [...new Set(availableGenres.sort())];
          genres.unshift("Tous");

          var key = 0;
          genres = genres.map(i => new Object({
            key: ++key,
            value: i,
          }))

          // Updating the list with the formated genres
          collection = collection.map(item => {
            var formated = [];
            item.basic_information.genres.forEach(i => {
              let existingGenre = genres.find(g => {
                return g.value == i;
              })
              if (existingGenre) {
                formated.push(existingGenre);
              }
            });
            item = formatVinyleToStandard(item)
            item.genres = formated;

            let savedItem = searchCollection.find(itemInCollection => itemInCollection.discogs.album.id == item.id);
            if (savedItem) {
              item.offline = true;
              item.spotify = savedItem.spotify;
              item.deezer = savedItem.deezer;
            } else {
              item.offline = false;
            }

            return item;
          })
        }
        collection.genres = genres;        

        resolve(collection)
      })
      .catch(error => {
        reject(error)
      })
  });
}


function getReleasesDetails(token, secret, releasesJSON, spotify_token) {
  return new Promise(async (resolve, reject) => {
    let releases = JSON.parse(releasesJSON);
    try {
      let savedReleases = await DiscogsCollection.find({ 'discogs.album.id': releases }, { 'discogs.album.id': 1 });
      if (savedReleases) {
        savedReleases = savedReleases.map(obj => obj.discogs.album.id);
        releases = releases.filter(id => !savedReleases.includes(id));
      }

      if (releases.length > 0) {
        clearStackTimeout();
        const maxSizeToHandle = 60;
        let results = await Promise.all(releases.slice(0, maxSizeToHandle).map(id => fetchReleaseDetails(token, secret, id).catch(err => console.log(err))))
        results = results.filter(i => !!i).map(i => formatReleaseToStandard(i));


        saveCollection(results)
          .then(() => {
            tool.dispatchCompatibilityDiscogs(releases, spotify_token)          
            resolve(results)
          })
          .catch(err => {
            reject(err)
          })
      } else {
        reject(utils.error('No items to insert' , 204))
      }
    } catch(err) {
      reject(err)
    }
  })
}

function saveCollection(results) {
  return DiscogsCollection.bulkWrite(
    results.map((item) => 
      ({
        updateOne: {
          filter: { 'discogs.album.id' : item.id },
          update: { $set: { 
            discogs: {
              album: {
                id: item.id,
                name: item.name,
                release_date: item.updated_at,
                link: item.link,
                upc: item.upc,
                nb_tracks: item.nb_tracks,
                artists: item.artists.map(artist => {
                  return {
                    id: artist.id,
                    name: artist.name,
                    link: artist.link,
                  }
                })
              },
              tracks: item.tracks.map(track => {
                return {
                  id: track.id,
                  name: track.name,
                  isrc: track.isrc,
                  duration: track.duration,
                  link: track.link,
                  artists: track.artists,                    
                }
              })
            }
          }},
          upsert: true
        }
      })
    )
  )
}

function formatVinyleToStandard(album){
  let albumInfo = album.basic_information;
  return {
    _obj: 'vinyle',
    _from: 'discogs',
    _uid: 'discogs-vinyle-'+albumInfo.id,
    // Related to the author
    id: albumInfo.id,
    name: albumInfo.title,
    type: 'vinyle',
    picture: albumInfo.cover_image,
    link: "https://www.discogs.com/release/"+albumInfo.id,
    upc: null,
    artists: albumInfo.artists,
    updated_at: albumInfo.year,
    added_at: album.date_added,
  };
}

function formatArtistToStandard(artist) {
  return {
    _obj: 'artist',
    _from: 'discogs',
    _uid: 'discogs-artist-'+artist.id,
    id: artist.id,
    name: artist.name,
    link: 'https://www.discogs.com/artist/'+artist.id 
  }
}

function formatTrackToStandard(track) {
  let duration = 0;
  if (track.duration) {
    let minutes = track.duration.split(':')[0];
    let seconds = track.duration.split(':')[1];
    duration += parseInt(minutes) * 60 * 1000;
    duration += parseInt(seconds) * 1000;
  }

  return {
    _obj: 'track',
    _from: 'discogs',
    _uid: 'discogs-track-'+track.name,
    id: null,
    name: track.name||track.title,
    isrc: null,
    duration: duration,
    link: null,
    artists: track.artists && track.artists.length > 0 ? track.artists.map(a => formatArtistToStandard(a)) : []
  }
}

function formatReleaseToStandard(release){
  let barcode = release.identifiers||null;
  if (barcode) {
    barcode = barcode.find(i => i.type == 'Barcode');
    if (barcode) {
      const regex = new RegExp('[^0-9]', 'g');
      barcode = barcode.value.replace(regex,'');
    }
  }
  let artists = [];
  if (release.artists) {
    if (release.tracklist && release.tracklist.length > 0 && release.artists.map(a => a.name).includes('Various')) {
      let various = [];
      for (let i = 0 ; i  < release.tracklist.length ; i++) {
        let track = release.tracklist[i];
        Array.prototype.push.apply(various, track.artists.map(artist => formatArtistToStandard(artist)));
      }
      Array.prototype.push.apply(artists, various);
    } else {
      Array.prototype.push.apply(artists, release.artists.map(artist => formatArtistToStandard(artist)));
    }
  }

  return {
    _obj: 'release',
    _from: 'discogs',
    _uid: 'discogs-release-'+release.id,
    // Related to the author
    id: release.id,
    name: release.title,
    type: 'release',
    picture: null,
    link: release.uri,
    upc: barcode,
    artists: artists,
    tracks: release.tracklist.map(i => formatTrackToStandard(i)),
    nb_tracks: release.tracklist.length,
    updated_at: release.released,
    added_at: release.date_added,
  };
}

function sortReleases(a, b) {
  if ( a.date_added == null ) return 1;
  if ( b.date_added == null ) return -1;

  if ( a.date_added > b.date_added ) {
    return -1;
  }
  if ( a.date_added < b.date_added ) {
    return 1;
  }
  return 0;
}

exports.getIdentity = getIdentity;
exports.getMeAccount = getMeAccount;
exports.getFolders = getFolders;
exports.getFolderItems = getFolderItems;
exports.getReleasesDetails = getReleasesDetails;

