/**
 * Shared Image Cache & Batched Loader for Visualizer Components
 * 
 * Prevents browser freeze by throttling profile picture requests.
 * Instead of firing 500+ simultaneous HTTP requests, this queues them
 * and processes in batches of 30 with 200ms delays between batches.
 */

const imageCache = {};       // cacheKey → Image object | 'pending' | 'skipped'
const loadingQueue = [];     // queue of { cacheKey, url } waiting to load
let activeLoads = 0;
const MAX_CONCURRENT = 5;    // reduced from 30 to 5 for safety
const MAX_TOTAL_REQUESTS = 50;
let totalRequestsMade = 0;

/**
 * Get a cached Image object by key.
 * Returns the Image if loaded/loading, or null if not yet requested.
 */
export function getImage(cacheKey) {
  const entry = imageCache[cacheKey];
  // Return null for 'pending' sentinel — image hasn't started loading yet
  if (!entry || entry === 'pending') return null;
  return entry;
}

/**
 * Check if an image is fully loaded and ready to draw on canvas.
 */
export function isImageReady(cacheKey) {
  const img = imageCache[cacheKey];
  return img && img !== 'pending' && img.complete && img.naturalWidth !== 0;
}

/**
 * Request an image to be loaded. If already cached or queued, this is a no-op.
 * The image will be loaded when a batch slot opens up.
 */
export function requestImage(cacheKey, url) {
  if (!cacheKey) return;

  // Already loaded, loading, queued, or skipped — skip
  if (imageCache[cacheKey]) return;

  // Enforce the hard 50 images limit
  if (totalRequestsMade >= MAX_TOTAL_REQUESTS) {
    imageCache[cacheKey] = 'skipped';
    return;
  }
  
  totalRequestsMade++;

  // Mark as pending to prevent duplicate entries
  imageCache[cacheKey] = 'pending';
  loadingQueue.push({ cacheKey, url });
  
  console.log(`[ImageLoader] 📥 Queued: ${cacheKey} (${totalRequestsMade}/${MAX_TOTAL_REQUESTS})`);
  
  // Trigger processing
  processQueue();
}

let isBatchProcessing = false;

async function processQueue() {
  // 1. If already processing a batch or queue is empty, stop
  if (isBatchProcessing || loadingQueue.length === 0) return;

  // 2. Lock to prevent overlapping batch triggers
  isBatchProcessing = true;

  // 3. Take up to 5 items from the queue
  const batch = [];
  while (batch.length < MAX_CONCURRENT && loadingQueue.length > 0) {
    batch.push(loadingQueue.shift());
  }

  console.log(`[ImageLoader] 🚀 Firing batch of ${batch.length} (Total made: ${totalRequestsMade}/${MAX_TOTAL_REQUESTS})`);

  // 4. Fire all images in the batch in parallel (async)
  const promises = batch.map(item => {
    return new Promise((resolve) => {
      const { cacheKey, url } = item;
      activeLoads++;
      
      const img = new Image();
      
      const finalize = () => {
        activeLoads--;
        resolve();
      };

      img.onload = () => {
        console.log(`[ImageLoader] ✅ Success: ${cacheKey}`);
        finalize();
      };
      img.onerror = () => {
        console.warn(`[ImageLoader] ❌ Failed: ${cacheKey}`);
        finalize();
      };

      img.src = url;
      imageCache[cacheKey] = img;
    });
  });

  // 5. Wait for the entire batch to complete (success or fail)
  await Promise.all(promises);

  // 6. Mandatory 1-second cooldown between batches to protect the endpoint
  console.log(`[ImageLoader] ⏳ Batch complete. Cooling down for 1s...`);
  setTimeout(() => {
    isBatchProcessing = false;
    processQueue();
  }, 1000);
}

/**
 * Build the profile picture URL for a given username.
 */
export function buildProfilePfpUrl(usernameValue) {
  const normalized = String(usernameValue || "").trim().replace(/^@+/, "");
  if (!normalized) return "/profile.png";
  return `https://tgpfp.darkmap.org/pfp?username=@${normalized}`;
}
