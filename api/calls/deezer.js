const http = require('http');
const sleep = require('await-sleep');
const moment = require('moment');
const mutils = require('../../mutils');

const call_limit = 100; // Limit of items to retrieve

/**
 * httpCall Call the API end parse de response
 * @params options
 */
const httpCall = async function(options) {
  return new Promise((resolve, reject) => {
    var req = http.get(options, response => {
      // Event when receiving the data
      var responseBody = "";
      response.on('data', function(chunck) { responseBody += chunck });

      // Event when the request is ending
      response.on('end', () => {
        if (response.statusCode === 200) {
          try {
            let json = JSON.parse(responseBody)
            if (!json) { // json is undefined or null
              reject(mutils.error("Unvalid json", 500));
            } else if (json.error) { // json has an error (set by Deezer)
              reject(mutils.error(json.error.message, json.error.code));
            } else { // otherwise, json is ok
              resolve(json)
            }
          } catch(e) {
            reject(mutils.error(e.message, 500));
          }
        } else {
          reject(mutils.error(response, response.statusCode));
        }
      })
    }).on('error', function(e) {
      reject(mutils.error(e.message, 500));
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
 * getArtist Return the artist content with its albums
 * @params id
 */
async function getRelatedArtists(id) {

  var artists = [];
  var callError;
  var retry = 10;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/artist/'+id+'/related',
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
      await Promise
        .all(call.data.map(a => getArtist(a.id)))
        .then(results => {
          results.forEach((a) => {
            if (a.albums && a.albums.data.length > 0) {            
              artists.push(formatArtistToFeed(a));
            }
          })
        });
    } else {
      await sleep(1500);
    }
  } while (!artists && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (artists) {
      resolve(artists);
    } else {
      reject(callError);
    }
  })
}

/**
 * getAlbums Return the albums loved by a user
 * @params user_id
 * @params access_token
 */
async function getAlbums(user_id = 'me', access_token = null) {

  var albums = [];
    
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
        path: '/user/'+user_id+'/albums?limit='+call_limit+'&index='+index+(access_token ? '&access_token='+access_token : ''),
        method: 'GET',
        headers: {
          'content-type': 'text/json'
        },
      };

      httpCall(options)
        .then(response => { // response is ok, push the result in array
          Array.prototype.push.apply(albums, response.data)
          if(response.next) { // if has a next object, keep going
            recursive(index+call_limit)
              .catch(() => resolve(albums)); // resolve the iterations if an error happens
          } else { // no more page, resolve with the result
            resolve(artists);
          }
        })
        .catch(err => {
          if (retry > 0 && err.code == 429) { // too many request and still have a retry, so wait for a delay and get back
            setTimeout(recursive, 1500, index, retry-1);
          } else {
            if(albums.length == 0) { // if there's no playlist retrieved, reject with the error
              reject(err);              
            } else { // otherwise, best-effort mode
              resolve(albums);
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
async function getAlbum(id) {

  var album;
  var callError;
  var retry = 10;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/album/'+id,
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
      album = call; // push the data in the response
    } else {
      await sleep(1500);
    }
  } while (!album && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (album) {
      resolve(album);
    } else {
      reject(callError);
    }
  })
}

/**
 * getArtist Return the artist content with its albums
 * @params id
 */
async function getAlbumContent(id) {

  var content;
  var callError;
  var retry = 10;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/album/'+id+'/tracks',
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
      content = call; // push the data in the response
    } else {
      await sleep(1500);
    }
  } while (!content && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (content) {
      resolve(content);
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


/**
 * getPlaylistContent Return the artist content with its albums
 * @params id
 */
async function getPlaylistContent(id) {

  var content;
  var callError;
  var retry = 10;

  // get the general data of the artist
  do {
    const options = {
        hostname: 'api.deezer.com',
        path: '/playlist/'+id,
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
      content = call; // push the data in the response
    } else {
      await sleep(1500);
    }
  } while (!content && retry > 0); // loop while there is another page
  
  return new Promise((resolve, reject) => {
    if (content) {
      resolve(content);
    } else {
      reject(callError);
    }
  })
}

/**
 * getMyReleases Return the releases based on the user
 * @params user_id
 * @params access_token
 */
async function getMyReleases(user_id = 'me', access_token = null) {
  var releases = [];
  var callError;

  const artists = await getArtists(user_id, access_token)
    .catch(err => callError = err);

  if(artists) {
    await Promise
      .all(artists.map(a => getArtist(a.id)))
      .then(results => {
        results.forEach((a) => {
          if (a.albums && a.albums.data.length > 0) {            
            releases.push(formatArtistToFeed(a));
          }
        })
      });
  }

  const playlists = await getPlaylists(user_id, access_token)
    .catch(err => callError = err);

  if(playlists) {
    playlists.forEach(p => {
      if(!p.is_loved_track && p.creator.id != user_id) {
        releases.push(formatPlaylistToFeed(p));
      }
    });
  }

  return new Promise((resolve, reject) => {
    if (releases.length == 0) {
      reject(mutils.error("No content"), 200);
    } else {
      releases.sort((a,b) => sortLastReleases(a,b));
      resolve(releases)
    }
  });
}


/**
 * getMyReleases Return the releases based on the user's friend
 * @params user_id
 * @params access_token
 */
async function getReleases(user_id, access_token = null) {
  var releases = [];
  var callError;

  const artists = await getArtists(user_id, access_token)
    .catch(err => callError = err);

  if(artists) {
    await Promise
      .all(artists.map(a => getArtist(a.id)))
      .then(results => {
        results.forEach((a) => {
          if (a.albums && a.albums.data.length > 0) {            
            releases.push(formatArtistToFeed(a));
          }
        })
      });
  }

  const playlists = await getPlaylists(user_id, access_token)
    .catch(err => callError = err);

  if(playlists) {
    playlists.forEach(p => {
      releases.push(formatPlaylistToFeed(p));
    });
  }

  const albums = await getAlbums(user_id, access_token)
    .catch(err => callError = err);

  if(albums) {
    albums.forEach(a => {
      let existingAlbum = releases.find(r => {
        return r.id == a.id && r.content_type == a.record_type;
      });
      if (! existingAlbum) {
        releases.push(formatAlbumToFeed(a));
      }
    });
  }

  return new Promise((resolve, reject) => {
    if (releases.length == 0) {
      reject(mutils.error("No content"), 200);
    } else {
      releases.sort((a,b) => sortLastReleases(a,b));
      resolve(releases)
    }
  });
}

async function getReleaseContent(obj, id) {
  return new Promise((resolve, reject) => {
  
    console.log('obj= '+obj+' id= '+id)

    if(obj === '1' || obj === '2') {
      // retrieve the general content
      const promise = getAlbum(id)
        .then((response) => {
          return response;
        }).catch(err => reject(err));

      // retrieve the related artists
      promise.then((release) => {
        getRelatedArtists(release.artist.id).then((response) => {
          release.related = response;
          release.related.sort((a,b) => sortLastReleases(a,b));
          resolve(release);
        })
      }).catch(err => reject(err));
    } else if (obj === '3') {
      getPlaylistContent(id)
        .then((response) => {
          resolve(response);          
        }).catch(err => reject(err));
    } else {
      reject(mutils.error('No content', 200))
    }
  });
}

function formatArtistToFeed(artist){
  return {
    _obj: 1,
    _uid: artist.albums.data[0].record_type+'-'+artist.id+'-'+artist.albums.data[0].id,
    // Related to the author
    id: artist.id,
    name: artist.name,
    picture: artist.picture_small,
    link: artist.link,
    updated_at: artist.albums.data[0].release_date,
    // Related to the content
    content_id: artist.albums.data[0].id,
    content_title: artist.albums.data[0].title,
    content_type: artist.albums.data[0].record_type,
    content_picture: artist.albums.data[0].cover_medium,
    content_link: artist.albums.data[0].link,
    content_last: artist.albums.data[0],
    content_full: artist.albums,
  };
}

function formatAlbumToFeed(album) {
  return {
    _obj: 2,
    _uid: album.record_type+'-'+album.artist.id+'-'+album.id,
    // Related to the author
    id: album.artist.id,
    name: album.artist.name,
    picture: album.artist.picture_small,
    link: "https://www.deezer.com/profile/" + album.artist.id,
    updated_at: timestampToDate(album.time_add),
    // Related to the content
    content_id: album.id,
    content_title: album.title,
    content_type: album.record_type,
    content_picture: album.cover_medium,
    content_link: album.link,
    content_last: album,
    content_full: album,
  };
}

function formatPlaylistToFeed(playlist) {
  return {
    _obj: 3,
    _uid: playlist.type+'-'+playlist.creator.id+'-'+playlist.id,
    // Related to the author
    id: playlist.creator.id,
    name: playlist.creator.name,
    picture: null,
    link: "https://www.deezer.com/profile/" + playlist.creator.id,
    updated_at: playlist.time_mod ? timestampToDate(playlist.time_mod) : timestampToDate(playlist.time_add),
    // Related to the content
    content_id: playlist.id,
    content_title: playlist.title,
    content_type: playlist.type,
    content_picture: playlist.picture_medium,
    content_link: playlist.link,
    content_last: playlist,
    content_full: playlist,
  };
}

function sortLastReleases ( a, b ) {
  if ( a.content_full.length == 0 ) return 1;
  if ( b.content_full.length == 0 ) return -1;

  if ( a.updated_at > b.updated_at ) {
    return -1;
  }
  if ( a.updated_at < b.updated_at ) {
    return 1;
  }
  return 0;
}

function timestampToDate(seconds) {
  return moment.unix(seconds).format("YYYY-MM-DD");
}

exports.getArtist = getArtist;
exports.getRelatedArtists = getRelatedArtists;
exports.getArtists = getArtists;
exports.getAlbums = getAlbums;
exports.getPlaylists = getPlaylists;
exports.getMyReleases = getMyReleases;
exports.getReleases = getReleases;
exports.getReleaseContent = getReleaseContent;

