export const config = Object.freeze({
  jwtExpiresIn: '14d',
  supportedMimeType: [
    'image/jpeg',
    'image/png',
    'video/mp4',
    'video/quicktime',
  ],
  uploadsBasePath: 'public/uploads/',
  uploadsPublicPath: 'https://gym.bitrey.it/public/uploads/',
  maxWorkoutHoursPerDay: 18, // you can't possibly workout for > 18 hours a day
  minutesPerPoint: 45,
});
