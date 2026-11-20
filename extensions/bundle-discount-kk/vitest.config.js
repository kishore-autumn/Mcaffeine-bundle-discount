export default {
  resolve: {
    preserveSymlinks: true,
  },
  test: {
    include: ['tests/bundle-logic.test.js'],
    forceRerunTriggers: [
      '**/tests/fixtures/**',
      '**/src/**',
    ],
  },
};
