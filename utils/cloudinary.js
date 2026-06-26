import { v2 as cloudinary } from 'cloudinary';

// Cần set 3 biến môi trường này trên Render (giống CRABOR đã dùng):
// CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Nhận buffer ảnh (từ multer memoryStorage) -> trả về URL ảnh trên Cloudinary
export const uploadImageBuffer = (buffer, folder = 'hocho') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

export default cloudinary;
