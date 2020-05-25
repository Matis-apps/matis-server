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
        try {
          let json = JSON.parse(responseBody)
          if (response.statusCode === 200) {
            if (!json) { // json is undefined or null
              reject(utils.error("Unvalid json", 500));
            } else if (json.error) { // json has an error (set by Deezer)
              reject(utils.error(json.error.message, json.error.code));
            } else { // otherwise, json is ok
              resolve(json)
            }
          } else {
            if(json.error) {
              reject(utils.error(json.error.message, response.statusCode));
            } else {
              reject(utils.error("Something went wrong...", 500));
            }
          }
        } catch(e) {
          reject(utils.error(e.message, 500));
        }
      })
    }).on('error', function(e) {
      reject(utils.error(e.message, 500));
    });
  })
}

function genericHttps(access_token, path) {
  return new Promise(async (resolve, reject) => {
    var result = null;
    var error = null;
    var retry = retry_limit;

    // get the general data of the artist
    do {
      const options = {
        hostname: 'api.spotify.com',
        path: path,
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
          if(callError.code == 401) reject(callError)
        });

      if(call) {
        result = call; // push the data in the response
      } else {
        await sleep(retry_timeout);
      }
    } while (!result && retry > 0); // loop while there is another page

    if (result) {
      resolve(result);
    } else if (callError) {
      reject(callError);
    } else {
      reject(utils.error("Something went wrong..."));
    }
  })
}

function recursiveHttps(access_token, path) {
  return new Promise((resolve, reject) => {
    var result = [];
    /**
     * recursive Fill the result array and handle the pagination recursively
     * @params index
     * @params retry
     */
    let recursive = async function (index = 0, retry = retry_limit) {
      // Configuration of the https request
      const options = {
        hostname: 'api.spotify.com',
        path: path + 'offset=' + index + '&limit='+call_limit,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer '+access_token,
          'content-type': 'text/json'
        },
      };

      httpsCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(result, response.data)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(result)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(result);
          }
        })
        .catch(error => {
          if (retry > 0 && error.code == 401) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, retry_timeout, index, retry-1);
          } else {
            if(result.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(utils.error(error.message, 500));              
            } else { // otherwise, best-effort mode
              resolve(result);
            }
          }
        });
    };

    recursive()
  })
}


async function getMeAccount(access_token) {
  return new Promise((resolve, reject) => {
    const path = '/v1/me/';
    genericHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

async function fetchSearch(access_token, type, query, strict) {
  return new Promise((resolve, reject) => {
    const path = '/v1/search?type='+type+'&q='+encodeURI(query);
    genericHttps(access_token, path)
      .then(result => {
        resolve(result)
      })
      .catch(error => {
        reject(error)
      })
  });
}

async function getSearch(access_token, query, types = "*", strict = true) {
  const allowedTypes = ['artist', 'album', 'playlist', 'track'];
  var search_types = [];
  var results = new Object, countResults = 0;
  var callError;

  if (types == "*") {
    search_types = allowedTypes;
  } else {
    if (types.includes(",")) {
      search_types = allowedTypes.filter(i => types.split(",").includes(i));
    } else {
      search_types = allowedTypes.filter(item => item == types);
    }
  }

  if (search_types.length > 0) {
    await utils.asyncForEach(search_types, async (type) => {
      await fetchSearch(access_token, type, query, strict)
        .then((result) => {
          switch(type) {
            case 'artist':
              results.artist = result.artists.items.map(i => formatArtistToStandard(i));
              countResults += results.artist.length || 0;

              break;
            case 'album':
              results.album = result.albums.items.map(i => formatAlbumToStandard(i));
              countResults += results.album.length || 0;
              break;
            case 'playlist':
              results.playlist = result.playlists.items.map(i => formatPlaylistToStandard(i));
              countResults += results.playlist.length || 0;
              break;
            case 'track':
              results.track = result.tracks.items.map(i => formatTrackToStandard(i));
              countResults += results.track.length || 0;
              break;
          }
        })
        .catch(err => callError = err)
    })
    results.total = countResults;

    if (strict) {
      countResults = 0;
      await utils.asyncForEach(search_types, async (type) => {
        switch(type) {
          case 'artist':
            if (results.artist) {
              results.artist = results.artist.filter(item => item.name.toUpperCase() == query.toUpperCase())
              countResults += results.artist.length;
            }
            break;
          case 'album':
            if (results.album) {
              await Promise
                .all(results.album.map(a => fetchAlbum(access_token, a.id).catch(err => callError = err)))
                .then(albums => {
                  results.album = albums.map(i => formatAlbumToStandard(i))
                  countResults += results.album.length;
                }).catch(err => callError = err);
            }
            break;
          case 'playlist':
              results.playlist = results.playlist.filter(item => item.name.toUpperCase() == query.toUpperCase())
              countResults += results.playlist.length || 0;
              break;
          case 'track':
            if (results.track) {
              await Promise
                .all(results.track.map(t => fetchTrack(access_token, t.id).catch(err => callError = err)))
                .then(tracks => {
                  results.track = tracks.map(i => formatTrackToStandard(i))
                  countResults += results.track.length;
                }).catch(err => callError = err);
            }
            break;
        }
      })
      results.total = countResults;
    }
  } else {
    callError = utils.error("Bad t paramater", 400)
  }

  return new Promise((resolve, reject) => {
    if (countResults == 0) {
      if (callError) {
        reject(callError)
      } else {
        reject(utils.error("No content", 200))
      }
    } else {
      resolve(results)
    }
  })
}


function searchAlbumUPC(access_token, query, upc) {
  return new Promise(async (resolve, reject) => {

    var album = null;
    var error = null;
    var index = 0;
    var total = call_limit;
    var retry = retry_limit;
    var limit = call_limit/2; // improve the performances due to fullAlbums.filter
    
    do {
      const path = '/v1/search?type=album&limit=' + limit + '&offset=' + index + '&q=' + encodeURI(query);      
      let albums = await genericHttps(access_token, path).catch(err => error = err);

      if(albums && albums.albums && albums.albums.items) {
        total = albums.total;
        let fullAlbums = await Promise
          .all(albums.albums.items.map(t => fetchAlbum(access_token, t.id)))
          .then(tracks => {
            retry = retry_limit;
            return tracks 
          })
          .catch(err => error = err);
        if (fullAlbums && fullAlbums.length > 0) {
          error = null;
          index+=limit;
          album = fullAlbums.filter(a => a.external_ids.upc == upc);
          album = album[0] ? formatAlbumToStandard(album[0]) : null;
        }
      }
      if (error) {
        if (error.code == 401) retry = 0 && reject(error);
        else retry-- && await sleep(retry_timeout); 
      }
    } while (!album && retry > 0 && total > index)

    if (album) {
      resolve(album)
    } else if (error) {
      reject(error)
    } else {
      reject(utils.error("Not found", 200))
    }
  });
}

function searchTrackISRC(access_token, query, isrc) {
  return new Promise(async (resolve, reject) => {

    var track = null;
    var error = null;
    var index = 0;
    var total = call_limit;
    var retry = retry_limit;
    var limit = call_limit/2; // improve the performances due to fullAlbums.filter

    do {
      const path = '/v1/search?type=track&limit=' + limit + '&offset=' + index + '&q=' + encodeURI(query);
      let tracks = await genericHttps(access_token, path).catch(err => error = err);

      if(tracks && tracks.tracks && tracks.tracks.items) {
        total = tracks.total;
        let fullTracks = await Promise
          .all(tracks.tracks.items.map(t => fetchTrack(access_token, t.id)))
          .then(tracks => { 
            retry = retry_limit;
            return tracks 
          })
          .catch(err => error = err);
        if (fullTracks && fullTracks.length > 0) {      
          error = null;
          index+=limit;
          track = fullTracks.filter(t => t.external_ids.isrc == isrc);
          track = track[0] ? formatTrackToStandard(track[0]) : null;
        }
      }
      if(error) {
        if (error.code == 401) retry = 0 && reject(error);
        else retry-- && await sleep(retry_timeout); 
      }
    } while (!track && retry > 0 && total > index)

    if (track) {
      resolve(track)
    } else if (error) {
      reject(error)
    } else {
      reject(utils.error("Not found", 200))
    }
  });
}


/**
 * fetchAlbum
 * @params id
 */
function fetchAlbum(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/albums/'+id;
    genericHttps(access_token, path)
      .then(result => {
        resolve(result);
      })
      .catch(error => reject(error));
  });
}

/**
 * fetchTrack
 * @params id
 */
function fetchTrack(access_token, id) {
  return new Promise((resolve, reject) => {
    const path = '/v1/tracks/'+id;
    genericHttps(access_token, path)
      .then(result => {
        resolve(result);
      })
      .catch(error => reject(error));
  });
}

////////////////////////
// FORMAT TO STANDARD //
////////////////////////
function formatArtistToStandard(artist) {
  return {
    _obj: 'artist',
    _uid: 'spotify-'+artist.type+'-'+artist.id,
    // Related to the author
    id: artist.id,
    name: artist.name,
    picture: artist.images && artist.images.length > 0 ? artist.images[0].url : null,
    link: artist.external_urls.spotify ? artist.external_urls.spotify : "https://open.spotify.com/artist/"+artist.id,
    albums: /*artist.albums ? artist.albums.data.map(a => formatAlbumToStandard(a)) :*/ null,
    nb_albums: /*artist.nb_album ? artist.nb_album :*/ null,
    nb_fans: artist.followers ? artist.followers.total : null,
    added_at: /*artist.time_add ? timestampToDate(artist.time_add) :*/ null,
  };
}

function formatAlbumToStandard(album){
  return {
    _obj: 'album',
    _uid: 'spotify-'+album.album_type+'-'+album.id,
    // Related to the author
    id: album.id,
    name: album.title,
    type: album.album_type,
    picture: album.images && album.images.length > 0 ? album.images[0].url : null,
    link: album.external_urls.spotify ? album.external_urls.spotify : "https://open.spotify.com/album/"+album.id,
    upc: album.external_ids.upc || null,
    artists: album.artists.map(i => formatArtistToStandard(i)),
    updated_at: album.release_date,
    added_at: /*album.time_add ? timestampToDate(album.time_add) :*/ null,
  };
}

function formatPlaylistToStandard(playlist){
  return {
    _obj: 'playlist',
    _uid: 'spotify-'+playlist.type+'-'+playlist.id,
    // Related to the author
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    picture: playlist.images && playlist.images.length > 0 ? playlist.images[0].url : null,
    link: playlist.external_urls.spotify ? playlist.external_urls.spotify : "https://open.spotify.com/playlist/"+playlist.id,
    updated_at: /*playlist.time_mod ? timestampToDate(playlist.time_mod) :*/ null,
    added_at: /*playlist.time_add ? timestampToDate(playlist.time_add) :*/ null,
  };
}

function formatTrackToStandard(track){  
  return {
    _obj: 'track',
    _uid: 'spotify-'+track.type+'-'+track.id,
    // Related to the author
    id: track.id,
    name: track.name,
    link: track.external_urls.spotify ? track.external_urls.spotify : "https://open.spotify.com/track/"+track.id,
    isrc: track.external_ids.isrc || null,
    preview: track.preview_url,
    duration: track.duration_ms ? timestampToTime(track.duration_ms) : null,
    artist: track.artists.map(i => formatArtistToStandard(i))
  };
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

///////////////
// UTILITIES //
///////////////
function sortLastReleases ( a, b ) {
  if ( a.content.updated_at == null ) return 1;
  if ( b.content.updated_at == null ) return -1;

  if ( a.content.updated_at > b.content.updated_at ) {
    return -1;
  }
  if ( a.content.updated_at < b.content.updated_at ) {
    return 1;
  }
  return 0;
}

function sortAlbums ( a, b ) {
  if ( a.release_date == null ) return 1;
  if ( b.release_date == null ) return -1;

  if ( a.release_date > b.release_date ) {
    return -1;
  }
  if ( a.release_date < b.release_date ) {
    return 1;
  }
  return 0;
}

function sortFriends ( a, b ) {
  if ( a.name == null ) return -1;
  if ( b.name == null ) return 1;

  if ( utils.capitalize(a.name) > utils.capitalize(b.name) ) {
    return 1;
  }
  if ( utils.capitalize(a.name) < utils.capitalize(b.name) ) {
    return -1;
  }
  return 0;
}

function timestampToDate(seconds) {
  return moment.unix(seconds/1000).format("YYYY-MM-DD");
}

function timestampToTime(seconds) {
  return moment.unix(seconds/1000).format("mm:ss");
}

exports.getMeAccount = getMeAccount;
exports.getSearch = getSearch;
exports.searchAlbumUPC = searchAlbumUPC;
exports.searchTrackISRC = searchTrackISRC;
