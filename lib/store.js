// 공유 상태(JSON) 저장소: Vercel Blob(private). 토큰이 없거나 데모 모드면 메모리에 둔다.
const { put, get, BlobNotFoundError, BlobPreconditionFailedError } = require('@vercel/blob');

const memory = new Map();
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN && process.env.DEMO_MODE !== '1';

async function readJSON(path, fallback) {
  if (!useBlob()) {
    const value = memory.get(path);
    return { data: value === undefined ? fallback : structuredClone(value), etag: null };
  }
  try {
    const result = await get(path, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return { data: fallback, etag: null };
    const text = await new Response(result.stream).text();
    return { data: JSON.parse(text), etag: result.blob.etag };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { data: fallback, etag: null };
    throw err;
  }
}

async function writeJSON(path, data, etag) {
  if (!useBlob()) {
    memory.set(path, structuredClone(data));
    return;
  }
  await put(path, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    ...(etag ? { ifMatch: etag } : {}),
  });
}

// 읽기→수정→조건부 쓰기. 다른 사람이 그 사이에 저장했으면 다시 읽어서 재시도한다.
async function updateJSON(path, fallback, mutate) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, etag } = await readJSON(path, fallback);
    const result = await mutate(data);
    const next = result === undefined ? data : result;
    try {
      await writeJSON(path, next, etag);
      return next;
    } catch (err) {
      if (err instanceof BlobPreconditionFailedError && attempt < 4) {
        await new Promise((r) => setTimeout(r, 150 + Math.random() * 350));
        continue;
      }
      throw err;
    }
  }
}

module.exports = { readJSON, writeJSON, updateJSON };
