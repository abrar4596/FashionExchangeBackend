const mongoose = require('mongoose');

const ListingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please add an item title'],
      trim: true,
      minlength: 4,
      maxlength: 120,
    },
    description: {
      type: String,
      required: [true, 'Please add a description of condition and fit'],
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },
    category: {
      type: String,
      required: [true, 'Please select a category'],
      enum: ['Women', 'Men', 'Kids', 'Vintage', 'Shoes', 'Accessories'],
    },
    brand: {
      type: String,
      default: 'Unbranded',
      trim: true,
    },
    size: {
      type: String,
      required: [true, 'Please specify item size'],
      enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'],
    },
    condition: {
      type: String,
      required: [true, 'Please specify condition tier'],
      enum: [
        'New with tags',
        'New without tags',
        'Very good',
        'Good',
        'Satisfactory',
      ],
    },
    estimatedValue: {
      type: Number,
      required: [true, 'Please provide an estimated swap value'],
      min: [1, 'Estimated value must be at least $1'],
    },
    city: {
      type: String,
      required: [true, 'Please specify the city/region for local discovery'],
      trim: true,
    },
    cityId: {
      type: String,
      trim: true,
    },
    images: {
      type: [String],
      required: [true, 'Please upload at least 1 image'],
      validate: [
        (val) => val.length > 0 && val.length <= 8,
        'Please provide between 1 and 8 images',
      ],
    },
    status: {
      type: String,
      enum: ['available', 'pending_swap', 'swapped'],
      default: 'available',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Indexes for fast multi-dimensional discovery (PRD requirement)
ListingSchema.index({ category: 1, condition: 1, city: 1, status: 1 });
ListingSchema.index({ city: 1, status: 1, createdAt: -1 });
ListingSchema.index({ cityId: 1, status: 1, createdAt: -1 });
ListingSchema.index({ owner: 1, status: 1 });
ListingSchema.index(
  { title: 'text', brand: 'text', description: 'text' },
  { weights: { title: 5, brand: 3, description: 1 } }
);

module.exports = mongoose.model('Listing', ListingSchema);
