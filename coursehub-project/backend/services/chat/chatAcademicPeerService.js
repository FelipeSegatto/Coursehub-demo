const { createServiceError, createConversation } = require("./chatConversationService");
const {
  isEligibleForAcademicPeer,
  listEligibleAcademicContacts,
  listStudentChatClasses,
} = require("./chatEligibilityService");

/**
 * Normalizes the pair regardless of who initiates -- A opening with
 * B and B opening with A must land on the exact same conversation.
 */
function buildAcademicPeerKey(userIdA, userIdB) {
  const [low, high] = [Number(userIdA), Number(userIdB)].sort((a, b) => a - b);

  return `academic_peer:${low}:${high}`;
}

async function listAcademicContacts(db, { userId, search, classId }) {
  return listEligibleAcademicContacts(db, { userId, search, classId });
}

async function listAcademicContactContext(db, { userId, search, classId }) {
  const [items, classes] = await Promise.all([
    listEligibleAcademicContacts(db, { userId, search, classId }),
    listStudentChatClasses(db, { userId }),
  ]);

  return { items, classes };
}

/**
 * Opening the same pair twice must return the same conversation, not
 * error or create a second one -- this is what the deterministic
 * conversation_key is for. The eligibility check here is the real
 * gate (not the contacts list, which a client could bypass): a
 * peerUserId that didn't come from listAcademicContacts still gets
 * rejected here.
 */
async function openAcademicPeerConversation(db, { userId, peerUserId }) {
  const normalizedPeerUserId = Number(peerUserId);

  if (!Number.isInteger(normalizedPeerUserId) || normalizedPeerUserId <= 0) {
    throw createServiceError("Aluno inválido.", 400);
  }

  if (normalizedPeerUserId === Number(userId)) {
    throw createServiceError("Você não pode iniciar uma conversa consigo mesmo.", 400);
  }

  const eligible = await isEligibleForAcademicPeer(db.promise(), {
    userIdA: userId,
    userIdB: normalizedPeerUserId,
  });

  if (!eligible) {
    throw createServiceError(
      "Você só pode conversar com colegas que compartilham uma matrícula ativa com você.",
      403
    );
  }

  const conversationKey = buildAcademicPeerKey(userId, normalizedPeerUserId);

  try {
    const { conversationId } = await createConversation(db, {
      type: "academic_peer",
      channelKind: "direct",
      createdByUserId: userId,
      initiatorRole: "student",
      conversationKey,
      participants: [
        { userId, participantRole: "student" },
        { userId: normalizedPeerUserId, participantRole: "student" },
      ],
    });

    return { conversationId, isNew: true };
  } catch (error) {
    if (error.statusCode === 409) {
      const [rows] = await db
        .promise()
        .query("SELECT id FROM chat_conversations WHERE conversation_key = ? LIMIT 1", [conversationKey]);

      if (rows.length > 0) {
        return { conversationId: rows[0].id, isNew: false };
      }
    }

    throw error;
  }
}

module.exports = {
  buildAcademicPeerKey,
  listAcademicContacts,
  listAcademicContactContext,
  openAcademicPeerConversation,
};
