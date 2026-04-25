/**
 * Microsoft Graph API response types
 */

export interface GraphEmailAddress {
  name?: string;
  address?: string;
}

export interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}

export interface GraphItemBody {
  contentType?: string;
  content?: string;
}

export interface GraphAttachment {
  id?: string;
  name?: string | null;
  contentType?: string | null;
  size?: number;
  contentBytes?: string;
  contentId?: string | null;
  isInline?: boolean;
  lastModifiedDateTime?: string;
  sourceUrl?: string;
  providerType?: string;
  permission?: string;
  isFolder?: boolean;
  '@odata.type'?: string;
}

export interface GraphFileAttachment extends GraphAttachment {
  '@odata.type': '#microsoft.graph.fileAttachment';
}

export interface GraphItemAttachment extends GraphAttachment {
  '@odata.type': '#microsoft.graph.itemAttachment';
}

export interface GraphReferenceAttachment extends GraphAttachment {
  '@odata.type': '#microsoft.graph.referenceAttachment';
  sourceUrl?: string;
  providerType?: string;
  permission?: string;
  isFolder?: boolean;
}

export interface GraphMessageFlag {
  flagStatus?: 'notFlagged' | 'complete' | 'flagged';
}

export interface GraphInternetMessageHeader {
  name: string;
  value: string;
}

export interface GraphMessage {
  id: string;
  changeKey?: string;
  conversationId: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  sentDateTime?: string;
  receivedDateTime: string;
  subject: string | null;
  body?: GraphItemBody;
  uniqueBody?: GraphItemBody;
  bodyPreview?: string;
  from?: GraphRecipient;
  sender?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  replyTo?: GraphRecipient[];
  attachments?: GraphAttachment[];
  hasAttachments?: boolean;
  isRead: boolean;
  isDraft: boolean;
  internetMessageId: string | null;
  internetMessageHeaders?: GraphInternetMessageHeader[];
  parentFolderId?: string;
  webLink?: string;
  importance?: string;
  inferenceClassification?: string;
  categories?: string[];
  flag?: GraphMessageFlag;
}

export interface GraphDeltaMessage extends GraphMessage {
  /**
   * Local adapter metadata. Microsoft Graph may report parentFolderId as an
   * opaque folder id; this preserves the configured folder ref used to query
   * the delta stream, such as "inbox" or "sentitems".
   */
  sourceQueriedFolderRef?: string;
  '@removed'?: {
    reason: string;
  };
}

export interface GraphDeltaPage<T = GraphDeltaMessage> {
  value: T[];
  '@odata.deltaLink'?: string;
  '@odata.nextLink'?: string;
}

export interface GraphDeltaResponse {
  value: GraphDeltaItem[];
  '@odata.deltaLink'?: string;
  '@odata.nextLink'?: string;
}

export interface GraphDeltaItem {
  id: string;
  '@odata.type'?: string;
  '@removed'?: {
    reason: string;
  };
  changeKey?: string;
  conversationId?: string;
  receivedDateTime?: string;
  subject?: string;
  body?: GraphItemBody;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  attachments?: GraphAttachment[];
  isRead?: boolean;
  isDraft?: boolean;
  internetMessageId?: string;
  flag?: GraphMessageFlag;
}

export interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}
