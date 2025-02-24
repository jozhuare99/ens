const staticFileDB = "static-site";
const fileTableName = "assets";
const CACHE_NAME = 'pwa-cache-v1';

const STATIC_ASSETS = [
  // '/index.html',
  '/offline.html',
  '/djabce192x192.png',
  '/favicon.ico',
  // '/css/my.css',
  '/img/t.svg',
  '/js/index.js',
  '/js/purify.min.js'
]
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(staticFileDB, 1)
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore(fileTableName, { keyPath: "url" });
    }
    request.onsuccess = () => {
      resolve(request.result);
    }

    request.onerror = () => {
      reject("failed to open IndexedDB");
    }
  })
}

function saveToIndexedDB(db, url, content) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(fileTableName, "readwrite");
    const store = transaction.objectStore(fileTableName);
    store.put({ url, content });
    transaction.oncomplete = () => {
      resolve();
    }

    transaction.onerror = () => {
      reject("Failed to store data in indexedDB");
    }
  })
}

function getFromIndexedDB(db, url) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(fileTableName, "readonly");
    const store = transaction.objectStore(fileTableName);
    const request = store.get(url);
    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.content)
      } else {
        reject("asset not found indexedDB");
      }
    }
    request.onerror = () => {
      reject("failed to retrieve data form indexedDB");
    }
  })
}

self.addEventListener('install', (event) => {
  if (self.caches) {
    event.waitUntil(
      self.caches.open(CACHE_NAME)
        .then((cache) => {
          return cache.addAll(STATIC_ASSETS);
        })
        .catch(e => console.error("failed to cache", e))
    );
  } else if(self.indexedDB) {
    event.waitUntil(
      openIndexedDB().then(db => {
        return Promise.all(
          STATIC_ASSETS.map(url => {
            return fetch(url).then((response => response.ok ? response.text() : Promise.reject(`Failed to fetch ${url}`)))
              .then(content => saveToIndexedDB(db, url, content))
              .catch(error => console.error(`Failed to save ${url} to IndexedDB:`, error));
          })
        )
      })
        .then(() => self.skipWaiting())
        .catch(error => {
          console.error("Failed to cache static assets in indexedDB", error);
        })
    )
  } else {
    console.error("install failed browser not supported")
  }
  
  
  
});

self.addEventListener("activate", event => {
  event.waitUntil(
    self.caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('old cache removed', cache)
            return caches.delete(cache);
          }
        })
      )
    })
  )
  return self.clients.claim();// Take control of the page immediately
})

function getContentType(url) {
  const extension = url.split('.').pop().toLowerCase();

  switch (extension) {
    case "html":
      return "text/html";
    case "css":
      return "text/css";
    case "js":
      return "application/javascript";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    case "json":
      return "application/json";
    default:
      // Default fallback for unknown file types
      return "text/plain";
  }
}

const isStandalone = navigator.standalone;

if(isStandalone){
  self.addEventListener('fetch', (event) => {
    const request = event.request;
    const requestUrl = new URL(request.url);
  
    if (self.caches) {
      event.respondWith(
        self.caches.match(event.request).then(response => {
          if (response) {
            return response;
          }
  
          return fetch(request).then(networkResponse => {
            if (networkResponse.status === 200) {
              console.log('Caching new response:', requestUrl);
              const responseClone = networkResponse.clone();
  
              caches.open(CACHE_NAME)
                .then(cache => cache.put(request.url, responseClone));
  
              return networkResponse;
            } else {
              return fetch(event.request).catch(() => caches.match('/offline.html'));
            }
          })
        }).catch(error => {
          console.error("No match in cache and Failed to fetch to network", event.request.url, error.message);
        })
      )
      return;
    } else if (self.indexedDB) {
      let currentDB;
      event.respondWith(
          openIndexedDB()
          .then(db => {
            currentDB = db
            return getFromIndexedDB(db, event.request.url)
          })
          .then(content => {
            if (content) {
              const contentType = getContentType(event.request.url);
              return new Response(content, { headers: { "Content-Type": contentType } });
            } else {
              console.log("fetching Url data then save it to localDatabase");
              return fetch(request).then( networkResponse => {
  
                if (networkResponse.status === 200) {
                  console.log('saving static file to localDatabase', requestUrl);
                  return networkResponse.clone().text().then(
                    content => {
                      saveToIndexedDB(currentDB, event.request.url, content);
                      return new Response(content, {
                        headers: { "Content-Type": getContentType(requestUrl) }
                      });
                    }
                  );
                } else {
                  return caches.match('/offline.html');
                }
  
              })
              .catch(e => {
                console.error("failed to fetch the url maybe check internet connection",e.message);
                return caches.match('/offline.html');
              })
  
            }
          }).catch(error => {
            console.error(error.message,"Failed to cache to Local Database");
            return caches.match('/offline.html');
  
          })
      )
    } else{
      console.log("Fetching Data normally")
    }
  });
}

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};

  const options = {
    body: data.body || 'You have a new notification!',
    icon: data.icon || '/img/bell.svg',
    badge: data.badge || '/img/ESminiStore.png'
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Notification', options)
  );
});

