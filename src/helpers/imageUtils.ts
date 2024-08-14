import { decode } from 'node-base64-image';
import randomstring from 'randomstring';
import { join } from 'path';
import { config } from '../config';

/**
 * Parses a base64 image and saves it to the uploads directory
 * @returns the public URL of the saved image
 */
export async function handleB64Image(base64Image: string): Promise<string> {
  const name =
    'img_' +
    randomstring.generate({
      length: 16,
      charset: 'alphanumeric',
    }) +
    '.png';

  const fullPath = join(config.uploadsBasePath, name);
  const publicPath = config.uploadsPublicPath + name;

  try {
    await decode(base64Image, {
      ext: 'png',
      fname: fullPath,
    });
    return publicPath;
  } catch (err) {
    console.error('Error decoding and saving image:', err);
    throw new Error('Image processing error');
  }
}
