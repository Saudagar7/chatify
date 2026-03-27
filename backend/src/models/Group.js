import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 250,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    profilePic: {
      type: String,
      default: '',
    },
    memberJoins: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        shouldHideHistory: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  { timestamps: true }
);

const ensureAdminIncluded = (doc) => {
  const adminId = doc.admin?.toString();
  if (!adminId) return;
  const hasAdmin = doc.members.some((member) => member.toString() === adminId);
  if (!hasAdmin) {
    doc.members.push(doc.admin);
    doc.memberJoins = doc.memberJoins || [];
    const hasAdminJoin = doc.memberJoins.some(
      (entry) => entry.user?.toString() === adminId
    );
    if (!hasAdminJoin) {
      doc.memberJoins.push({
        user: doc.admin,
        joinedAt: doc.createdAt || new Date(),
        shouldHideHistory: false,
      });
    }
  }
};

groupSchema.pre('save', function (next) {
  ensureAdminIncluded(this);
  next();
});

groupSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (!update) return next();
  if (update.$addToSet?.members || update.$set?.members) {
    const members = update.$addToSet?.members || update.$set?.members;
    if (Array.isArray(members)) {
      const adminId = (update.$set?.admin || this.getQuery().admin)?.toString();
      if (adminId && !members.includes(adminId)) {
        members.push(adminId);
      }
    }
  }
  next();
});

const Group = mongoose.model('Group', groupSchema);
export default Group;
