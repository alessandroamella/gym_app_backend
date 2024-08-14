import { decode } from 'node-base64-image';
import randomstring from 'randomstring';
import { join } from 'path';
import { config } from '../config';
import moment from 'moment';

/**
 * Parses a base64 image and saves it to the uploads directory
 * @returns the public URL of the saved image
 */
export async function handleB64Image(
  base64Image: string,
  prefix?: string,
): Promise<string> {
  try {
    const name =
      (prefix || 'img') +
      '_' +
      moment().format('YYYYMMDDHHmmss') +
      '_' +
      randomstring.generate({
        length: 16,
        charset: 'alphanumeric',
      }) +
      '.png';

    const fullPath = join(config.uploadsBasePath, name);
    const publicPath = config.uploadsPublicPath + name;

    const withoutExt = fullPath.slice(0, -4);

    console.debug('Saving image to:', fullPath, 'withoutExt:', withoutExt);

    await decode(base64Image, {
      ext: 'png',
      fname: withoutExt,
    });
    return publicPath;
  } catch (err) {
    console.error('Error decoding and saving image:', err);
    throw new Error('Image processing error');
  }
}
