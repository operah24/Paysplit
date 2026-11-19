'use strict';

/**
 * Fixed category list. IDs are hard-coded so they are identical in every
 * environment — the frontend sends these UUIDs as `categoryId`.
 * Re-running is safe: existing rows are updated in place.
 */
const CATEGORIES = [
  { id: '1bfbd459-e6ff-4907-aaf2-5472b99cbd9d', slug: 'emergency', name: 'Emergency' },
  { id: '748e79a9-dddf-4f0d-9a5f-2883f6a25083', slug: 'savings', name: 'Savings' },
  { id: '6ea6508e-dc31-4b7a-8345-b09c5abd879d', slug: 'vacation', name: 'Vacation' },
  { id: '7e9b9911-ad5e-4551-8ce0-5353f6ba2881', slug: 'investment', name: 'Investment' },
  { id: '888e5909-2a20-4478-b0e5-cc5dfeb533de', slug: 'rent-housing', name: 'Rent & Housing' },
  { id: 'd48629f3-7336-4e8d-bc15-f7de4c03c43d', slug: 'food-drinks', name: 'Food & Drinks' },
  { id: 'dff210eb-a785-409c-acd2-a9bfe47db846', slug: 'family-support', name: 'Family Support' },
  { id: '237cded8-83bb-4b70-86d4-148313525cfd', slug: 'tax-compliance', name: 'Tax & Compliance' },
  { id: 'd9990908-8aa7-4c2a-b3c9-49682493b222', slug: 'education', name: 'Education' },
  { id: '4028435a-c035-4513-85ee-8e25381a9d35', slug: 'utilities', name: 'Utilities' },
  { id: '3e88f12c-769a-48b5-a798-f34c282d4d71', slug: 'other', name: 'Other' },
  // System-only: used on incoming salary credits.
  {
    id: 'd910acf7-eb67-4cb0-8167-0ac7286b2c4e',
    slug: 'salary',
    name: 'Salary',
    is_selectable: false,
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = CATEGORIES.map((c, index) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      is_selectable: c.is_selectable !== false,
      sort_order: index + 1,
      created_at: now,
      updated_at: now,
    }));

    for (const row of rows) {
      await queryInterface.sequelize.query(
        `INSERT INTO categories (id, slug, name, is_selectable, sort_order, created_at, updated_at)
         VALUES (:id, :slug, :name, :is_selectable, :sort_order, :created_at, :updated_at)
         ON CONFLICT (id) DO UPDATE
           SET slug = EXCLUDED.slug, name = EXCLUDED.name,
               is_selectable = EXCLUDED.is_selectable, sort_order = EXCLUDED.sort_order,
               updated_at = EXCLUDED.updated_at, deleted_at = NULL`,
        { replacements: row },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('categories', { id: CATEGORIES.map((c) => c.id) }, {});
  },
};
