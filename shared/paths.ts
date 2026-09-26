/** Identifiants et chemins Firestore / Storage. */

export function enrollmentId(courseId: string, uid: string): string {
  return `${courseId}_${uid}`;
}

export const paths = {
  user: (uid: string) => `users/${uid}`,
  profile: (uid: string) => `profiles/${uid}`,
  creator: (uid: string) => `creators/${uid}`,
  /** Réglages d'envoi des emails : lisibles par le formateur, écrits par les Functions. */
  creatorMailSettings: (uid: string) => `creators/${uid}/private/mail`,
  /** Mot de passe SMTP chiffré : Functions uniquement. */
  creatorMailSecret: (uid: string) => `creators/${uid}/secrets/mail`,
  creatorMembers: (uid: string) => `creators/${uid}/members`,
  creatorMember: (schoolId: string, uid: string) => `creators/${schoolId}/members/${uid}`,
  creatorVimeoSettings: (uid: string) => `creators/${uid}/private/vimeo`,
  creatorVimeoSecret: (uid: string) => `creators/${uid}/secrets/vimeo`,
  course: (courseId: string) => `courses/${courseId}`,
  courseSettings: (courseId: string) => `courses/${courseId}/private/settings`,
  lesson: (courseId: string, lessonId: string) => `courses/${courseId}/lessons/${lessonId}`,
  comments: (courseId: string) => `courses/${courseId}/comments`,
  enrollment: (courseId: string, uid: string) => `enrollments/${enrollmentId(courseId, uid)}`,
  notifications: (uid: string) => `users/${uid}/notifications`,
  pushTokens: (uid: string) => `users/${uid}/pushTokens`,
  conversation: (id: string) => `conversations/${id}`,
  messages: (conversationId: string) => `conversations/${conversationId}/messages`,
  invite: (token: string) => `invites/${token}`,
  mail: (id: string) => `mail/${id}`,
  creatorRequest: (uid: string) => `creatorRequests/${uid}`,
};

export const storagePaths = {
  courseThumbnail: (courseId: string, fileName: string) =>
    `courses/${courseId}/thumbnail/${fileName}`,
  lessonThumbnail: (courseId: string, lessonId: string, fileName: string) =>
    `courses/${courseId}/lessons/${lessonId}/thumbnail/${fileName}`,
  lessonAttachment: (courseId: string, lessonId: string, fileName: string) =>
    `courses/${courseId}/lessons/${lessonId}/attachments/${fileName}`,
  avatar: (uid: string, fileName: string) => `users/${uid}/avatar/${fileName}`,
  creatorLogo: (uid: string, fileName: string) => `creators/${uid}/logo/${fileName}`,
};

/** Routes de l'application. */
export const routes = {
  login: "/connexion",
  signup: "/inscription",
  resetPassword: "/mot-de-passe-oublie",
  welcome: (token: string) => `/bienvenue/${token}`,
  myCourses: "/formations",
  course: (courseId: string) => `/formations/${courseId}`,
  lesson: (courseId: string, lessonId: string) => `/formations/${courseId}/${lessonId}`,
  admin: "/admin",
  adminCourses: "/admin/formations",
  adminCourse: (courseId: string) => `/admin/formations/${courseId}`,
  adminCourseContent: (courseId: string) => `/admin/formations/${courseId}/contenu`,
  adminCourseDetails: (courseId: string) => `/admin/formations/${courseId}/details`,
  adminCourseSalesPage: (courseId: string) => `/admin/formations/${courseId}/page-de-vente`,
  adminCourseSales: (courseId: string) => `/admin/formations/${courseId}/vente`,
  thanks: "/merci",
  adminLesson: (courseId: string, lessonId: string) =>
    `/admin/formations/${courseId}/lecons/${lessonId}`,
  adminMembers: "/admin/membres",
  adminComments: "/admin/commentaires",
  adminSettings: "/admin/parametres",
  adminMessages: "/admin/messages",
  adminConversation: (conversationId: string) => `/admin/messages/${conversationId}`,
  messages: "/messages",
  conversation: (conversationId: string) => `/messages/${conversationId}`,
  becomeCreator: "/devenir-formateur",
  platformRequests: "/plateforme/demandes",
  salesPage: (creatorSlug: string, courseSlug: string) => `/${creatorSlug}/${courseSlug}`,
  creatorPage: (creatorSlug: string) => `/${creatorSlug}`,
};
