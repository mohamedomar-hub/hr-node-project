/**
 * File: src/core/communityService.js
 */
const { query } = require('./db');
const { v4: uuidv4 } = require('uuid');

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS community_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    poster_code VARCHAR(50) NOT NULL,
    poster_name VARCHAR(150) NOT NULL,
    title VARCHAR(255),
    content TEXT,
    post_type VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`, [], 'commit');

  await query(`CREATE TABLE IF NOT EXISTS community_post_images (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    image_path VARCHAR(400),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`, [], 'commit');

  await query(`CREATE TABLE IF NOT EXISTS community_post_likes (
    post_id INT NOT NULL,
    user_code VARCHAR(50) NOT NULL,
    user_name VARCHAR(150),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_code),
    FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`, [], 'commit');

  await query(`CREATE TABLE IF NOT EXISTS community_post_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_code VARCHAR(50) NOT NULL,
    user_name VARCHAR(150),
    comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`, [], 'commit');
}

function buildInPlaceholders(values) {
  return values.map(() => '?').join(',');
}

async function createPost(posterCode, posterName, title, content, postType, postUuid = null) {
  await ensureTables();
  const uuid = postUuid || uuidv4();
  
  await query(
    "INSERT INTO community_posts (uuid, poster_code, poster_name, title, content, post_type) VALUES (?,?,?,?,?,?)",
    [uuid, posterCode, posterName, title, content, postType],
    'commit'
  );

  const row = await query(
    "SELECT id FROM community_posts WHERE uuid=? LIMIT 1",
    [uuid],
    'fetchone'
  );
  
  return row ? parseInt(row.id) : null;
}

async function listPosts() {
  await ensureTables();
  return await query("SELECT * FROM community_posts ORDER BY created_at DESC", [], 'fetchall');
}

async function listFeed(viewerCode, limit = 20) {
  await ensureTables();
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const posts = await query(
    `SELECT * FROM community_posts ORDER BY created_at DESC LIMIT ${safeLimit}`,
    [],
    'fetchall'
  );

  if (!posts || posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);
  const placeholders = buildInPlaceholders(postIds);

  const [images, comments, likeCounts, myLikes] = await Promise.all([
    query(
      `SELECT * FROM community_post_images WHERE post_id IN (${placeholders}) ORDER BY created_at ASC`,
      postIds,
      'fetchall'
    ),
    query(
      `SELECT * FROM community_post_comments WHERE post_id IN (${placeholders}) ORDER BY created_at ASC`,
      postIds,
      'fetchall'
    ),
    query(
      `SELECT post_id, COUNT(*) AS cnt FROM community_post_likes WHERE post_id IN (${placeholders}) GROUP BY post_id`,
      postIds,
      'fetchall'
    ),
    viewerCode
      ? query(
          `SELECT post_id FROM community_post_likes WHERE post_id IN (${placeholders}) AND user_code=?`,
          [...postIds, viewerCode],
          'fetchall'
        )
      : []
  ]);

  const imagesByPost = new Map();
  (images || []).forEach((img) => {
    if (!imagesByPost.has(img.post_id)) imagesByPost.set(img.post_id, []);
    imagesByPost.get(img.post_id).push(img);
  });

  const commentsByPost = new Map();
  (comments || []).forEach((c) => {
    if (!commentsByPost.has(c.post_id)) commentsByPost.set(c.post_id, []);
    commentsByPost.get(c.post_id).push(c);
  });

  const likesByPost = new Map();
  (likeCounts || []).forEach((r) => likesByPost.set(r.post_id, parseInt(r.cnt || 0, 10) || 0));

  const likedSet = new Set((myLikes || []).map((r) => r.post_id));

  return posts.map((post) => ({
    post,
    images: imagesByPost.get(post.id) || [],
    comments: commentsByPost.get(post.id) || [],
    likes: likesByPost.get(post.id) || 0,
    hasLiked: likedSet.has(post.id)
  }));
}

async function listHrPosts(limit = 5, types = null) {
  await ensureTables();
  if (!types || types.length === 0) {
    return await query(
      `SELECT * FROM community_posts ORDER BY created_at DESC LIMIT ${parseInt(limit)}`,
      [],
      'fetchall'
    );
  }

  const placeholders = types.map(() => '?').join(',');
  const sql = `
    SELECT * FROM community_posts
    WHERE post_type IN (${placeholders})
    ORDER BY created_at DESC
    LIMIT ${parseInt(limit)}
  `;
  const args = [...types];
  return await query(sql, args, 'fetchall');
}

async function deletePost(postId) {
  await ensureTables();
  const result = await query(
    "DELETE FROM community_posts WHERE id=?",
    [postId],
    'commit'
  );
  return result.affectedRows > 0;
}

async function getPost(postId) {
  await ensureTables();
  return await query(
    "SELECT * FROM community_posts WHERE id=? LIMIT 1",
    [postId],
    'fetchone'
  );
}

async function addPostImage(postId, imagePath) {
  await ensureTables();
  await query(
    "INSERT INTO community_post_images (post_id, image_path) VALUES (?,?)",
    [postId, imagePath],
    'commit'
  );
}

async function listPostImages(postId) {
  await ensureTables();
  return await query(
    "SELECT * FROM community_post_images WHERE post_id=? ORDER BY created_at ASC",
    [postId],
    'fetchall'
  );
}

async function toggleLike(postId, userCode, userName) {
  await ensureTables();
  const exists = await query(
    "SELECT 1 FROM community_post_likes WHERE post_id=? AND user_code=? LIMIT 1",
    [postId, userCode],
    'fetchone'
  );

  if (exists) {
    await query(
      "DELETE FROM community_post_likes WHERE post_id=? AND user_code=?",
      [postId, userCode],
      'commit'
    );
    return false; // Unliked
  } else {
    await query(
      "INSERT INTO community_post_likes (post_id, user_code, user_name) VALUES (?,?,?)",
      [postId, userCode, userName],
      'commit'
    );
    return true; // Liked
  }
}

async function countLikes(postId) {
  await ensureTables();
  const row = await query(
    "SELECT COUNT(*) AS cnt FROM community_post_likes WHERE post_id=?",
    [postId],
    'fetchone'
  );
  return row ? parseInt(row.cnt || 0) : 0;
}

async function hasLiked(postId, userCode) {
  await ensureTables();
  const hit = await query(
    "SELECT 1 FROM community_post_likes WHERE post_id=? AND user_code=? LIMIT 1",
    [postId, userCode],
    'fetchone'
  );
  return !!hit;
}

async function addComment(postId, userCode, userName, comment) {
  await ensureTables();
  await query(
    "INSERT INTO community_post_comments (post_id, user_code, user_name, comment) VALUES (?,?,?,?)",
    [postId, userCode, userName, comment],
    'commit'
  );
}

async function listComments(postId) {
  await ensureTables();
  return await query(
    "SELECT * FROM community_post_comments WHERE post_id=? ORDER BY created_at ASC",
    [postId],
    'fetchall'
  );
}

module.exports = {
  createPost,
  listPosts,
  listFeed,
  listHrPosts,
  deletePost,
  getPost,
  addPostImage,
  listPostImages,
  toggleLike,
  countLikes,
  hasLiked,
  addComment,
  listComments
};
