import FontAwesome from '@expo/vector-icons/FontAwesome';
import type {
  AssistantCartAction,
  CartAction,
  MenuItem,
} from '@intelligent-bistro/contracts';
import { useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppScreen } from '@/src/components/AppScreen';
import {
  type CartActionResult,
  selectCartLines,
  useCartStore,
} from '@/src/features/cart/cartStore';
import { useMenu } from '@/src/features/menu/useMenu';
import { colors } from '@/src/theme/colors';
import { radii, spacing } from '@/src/theme/spacing';

import { sendAssistantMessage } from './assistantApi';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  timestamp: Date;
  actionResults?: CartActionResult[];
  clarificationOptions?: string[];
  confidence?: number;
  referencedItemIds?: string[];
};

type MenuItemLookup = Record<string, MenuItem>;

const quickPrompts = [
  'What is good here?',
  'Do you have vegan options?',
  'Suggest a combo under $15',
];

export function AssistantScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [lastReferencedItemIds, setLastReferencedItemIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Ask me about the menu, tell me what you are craving, or order naturally.',
      timestamp: new Date(),
    },
  ]);

  const cartLines = useCartStore(selectCartLines);
  const applyActions = useCartStore((state) => state.applyActions);
  const { error: menuError, isLoading: isMenuLoading, items, itemsById } = useMenu();

  const canSend = inputValue.trim().length > 0 && !isSending && !isMenuLoading && !menuError;
  const cartPayload = useMemo(
    () =>
      cartLines.map((line) => ({
        itemId: line.itemId,
        modifiers: line.modifiers,
        quantity: line.quantity,
      })),
    [cartLines]
  );

  async function sendMessage(messageText = inputValue) {
    const trimmedMessage = messageText.trim();

    if (!trimmedMessage || isSending || isMenuLoading || menuError) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createMessageId('user'),
      role: 'user',
      text: trimmedMessage,
      timestamp: new Date(),
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setInputValue('');
    setIsSending(true);

    try {
      const response = await sendAssistantMessage({
        cart: cartPayload,
        conversationHistory: buildConversationHistory(messages),
        lastReferencedItemIds,
        menu: items,
        message: trimmedMessage,
      });
      const shouldApplyActions = response.confidence >= 0.6 && !response.needsClarification;
      const actionResults = shouldApplyActions ? applyCartActions(response.actions) : [];

      setLastReferencedItemIds(response.referencedItemIds);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          actionResults,
          clarificationOptions: response.clarificationOptions,
          confidence: response.confidence,
          id: createMessageId('assistant'),
          referencedItemIds: response.referencedItemIds,
          role: 'assistant',
          text: response.assistantMessage,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: createMessageId('assistant'),
          role: 'assistant',
          text: 'I could not reach the ordering assistant. Check that the API server is running.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function applyCartActions(actions: AssistantCartAction[]) {
    if (actions.length === 0) {
      return [];
    }

    return applyActions(actions.map(toCartAction), itemsById);
  }

  function sendClarificationChoice(option: string) {
    sendMessage(`Add ${option}`);
  }

  return (
    <AppScreen contentContainerStyle={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardWrap}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>AI Assistant</Text>
            <Text style={styles.subtitle}>Your personal food assistant</Text>
          </View>
          <View style={styles.aiMark}>
            <FontAwesome color={colors.onPrimary} name="magic" size={22} />
          </View>
        </View>

        {menuError ? (
          <View style={styles.inlineError}>
            <FontAwesome color={colors.danger} name="exclamation" size={13} />
            <Text style={styles.inlineErrorText}>{menuError}</Text>
          </View>
        ) : null}

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chatContent}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
          style={styles.chatPanel}>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              menuItemsById={itemsById}
              message={message}
              onClarificationSelect={sendClarificationChoice}
            />
          ))}
          {isSending ? <TypingBubble /> : null}
        </ScrollView>

        <View style={styles.quickPromptShelf}>
          <ScrollView
            contentContainerStyle={styles.quickPromptRow}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickPromptScroll}>
            {quickPrompts.map((prompt) => (
              <Pressable
                disabled={isSending || isMenuLoading || !!menuError}
                key={prompt}
                onPress={() => sendMessage(prompt)}
                style={styles.quickPrompt}>
                <Text numberOfLines={1} style={styles.quickPromptText}>
                  {prompt}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.composer}>
          <TextInput
            editable={!isSending && !isMenuLoading}
            multiline
            onChangeText={setInputValue}
            onSubmitEditing={() => sendMessage()}
            placeholder={
              isMenuLoading
                ? 'Loading menu context...'
                : menuError
                  ? 'Menu context unavailable'
                  : 'Type your request...'
            }
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={inputValue}
          />
          <Pressable
            accessibilityLabel="Send assistant request"
            disabled={!canSend}
            onPress={() => sendMessage()}
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}>
            <FontAwesome color={colors.onPrimary} name="send" size={15} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

function MessageBubble({
  menuItemsById,
  message,
  onClarificationSelect,
}: {
  menuItemsById: MenuItemLookup;
  message: ChatMessage;
  onClarificationSelect: (option: string) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.messageRow, isUser ? styles.userMessageRow : styles.assistantMessageRow]}>
      {!isUser ? (
        <View style={styles.avatar}>
          <FontAwesome color={colors.onPrimary} name="magic" size={15} />
        </View>
      ) : null}
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.assistantMessageText]}>
          {message.text}
        </Text>
        {message.actionResults && message.actionResults.length > 0 ? (
          <ActionHistory menuItemsById={menuItemsById} results={message.actionResults} />
        ) : null}
        {!isUser && message.clarificationOptions && message.clarificationOptions.length > 0 ? (
          <ClarificationOptions
            onSelect={onClarificationSelect}
            options={message.clarificationOptions}
          />
        ) : null}
        <View style={styles.messageMetaRow}>
          {message.confidence !== undefined ? (
            <Text style={styles.confidenceText}>{Math.round(message.confidence * 100)}% confidence</Text>
          ) : null}
          <Text style={styles.timeText}>{formatTime(message.timestamp)}</Text>
        </View>
      </View>
    </View>
  );
}

function ClarificationOptions({
  onSelect,
  options,
}: {
  onSelect: (option: string) => void;
  options: string[];
}) {
  return (
    <View style={styles.clarificationOptions}>
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => onSelect(option)}
          style={styles.clarificationButton}>
          <Text numberOfLines={1} style={styles.clarificationButtonText}>
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ActionHistory({
  menuItemsById,
  results,
}: {
  menuItemsById: MenuItemLookup;
  results: CartActionResult[];
}) {
  return (
    <View style={styles.actionHistory}>
      <Text style={styles.actionHistoryTitle}>Cart actions</Text>
      {results.map((result, index) => (
        <ActionHistoryRow
          key={`${result.action.type}-${index}`}
          menuItemsById={menuItemsById}
          result={result}
        />
      ))}
    </View>
  );
}

function ActionHistoryRow({
  menuItemsById,
  result,
}: {
  menuItemsById: MenuItemLookup;
  result: CartActionResult;
}) {
  const itemId = 'itemId' in result.action ? result.action.itemId : undefined;
  const item = itemId ? menuItemsById[itemId] : undefined;
  const quantity = 'quantity' in result.action ? result.action.quantity : undefined;
  const modifiers = 'modifiers' in result.action ? result.action.modifiers : [];

  if (!item) {
    return (
      <View style={styles.actionRow}>
        <View
          style={[
            styles.actionDot,
            result.status === 'applied' ? styles.actionDotApplied : styles.actionDotMuted,
          ]}
        />
        <Text style={styles.actionText}>{formatActionResult(result)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.actionPreviewRow}>
      <Image source={{ uri: item.imageUrl }} style={styles.actionImage} />
      <View style={styles.actionPreviewBody}>
        <Text numberOfLines={1} style={styles.actionItemName}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={styles.actionItemMeta}>
          {formatActionMeta(result.action.type, quantity, modifiers)}
        </Text>
      </View>
      <View
        style={[
          styles.actionStatusPill,
          result.status === 'applied' ? styles.actionStatusApplied : styles.actionStatusMuted,
        ]}>
        <Text style={styles.actionStatusText}>
          {result.status === 'applied' ? 'Done' : 'Review'}
        </Text>
      </View>
    </View>
  );
}

function TypingBubble() {
  return (
    <View style={styles.assistantMessageRow}>
      <View style={styles.avatar}>
        <FontAwesome color={colors.onPrimary} name="magic" size={15} />
      </View>
      <View style={[styles.messageBubble, styles.assistantBubble, styles.typingBubble]}>
        <View style={styles.typingDot} />
        <View style={styles.typingDot} />
        <View style={styles.typingDot} />
      </View>
    </View>
  );
}

function formatActionResult(result: CartActionResult) {
  const statusLabel =
    result.status === 'applied'
      ? 'Applied'
      : result.status === 'noop'
        ? 'Checked'
        : 'Needs attention';

  return `${statusLabel}: ${result.message}`;
}

function toCartAction(action: AssistantCartAction): CartAction {
  switch (action.type) {
    case 'add':
      return {
        itemId: action.itemId,
        modifiers: action.modifiers,
        quantity: action.quantity,
        type: 'add',
      };
    case 'remove':
      return {
        itemId: action.itemId,
        modifiers: action.modifiers,
        quantity: action.quantity,
        type: 'remove',
      };
    case 'update_quantity':
      return {
        itemId: action.itemId,
        modifiers: action.modifiers,
        quantity: action.quantity,
        type: 'update',
      };
    case 'update_modifiers':
      return {
        itemId: action.itemId,
        modifiers: action.modifiers,
        type: 'update',
      };
    case 'clear_cart':
      return {
        type: 'clear',
      };
  }
}

function formatActionMeta(type: CartAction['type'], quantity?: number, modifiers: string[] = []) {
  const detailParts = [
    type === 'add'
      ? `Add ${quantity ?? 1}`
      : type === 'remove'
        ? quantity
          ? `Remove ${quantity}`
          : 'Remove'
        : type === 'update'
          ? quantity
            ? `Set qty ${quantity}`
            : 'Update'
          : titleCase(type),
    modifiers.length > 0 ? titleCase(modifiers.join(', ')) : undefined,
  ].filter(Boolean);

  return detailParts.join(' / ');
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildConversationHistory(messages: ChatMessage[]) {
  return messages.slice(-8).map((message) => ({
    content: message.text,
    referencedItemIds: message.referencedItemIds ?? [],
    role: message.role,
  }));
}

const sharedShadow = {
  elevation: 5,
  shadowColor: colors.cardShadow,
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.07,
  shadowRadius: 20,
};

const styles = StyleSheet.create({
  actionDot: {
    borderRadius: 4,
    height: 8,
    marginTop: 5,
    width: 8,
  },
  actionDotApplied: {
    backgroundColor: colors.success,
  },
  actionDotMuted: {
    backgroundColor: colors.muted,
  },
  actionHistory: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 7,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  actionHistoryTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  actionImage: {
    backgroundColor: colors.softAccent,
    borderRadius: radii.sm,
    height: 46,
    width: 46,
  },
  actionItemMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  actionItemName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  actionPreviewBody: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  actionPreviewRow: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 64,
    padding: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionStatusApplied: {
    backgroundColor: colors.success,
  },
  actionStatusMuted: {
    backgroundColor: colors.danger,
  },
  actionStatusPill: {
    borderRadius: radii.full,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  actionStatusText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  actionText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  aiMark: {
    ...sharedShadow,
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 18,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
  },
  assistantMessageRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-start',
  },
  assistantMessageText: {
    color: colors.ink,
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  chatContent: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  chatPanel: {
    flex: 1,
  },
  clarificationButton: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: radii.full,
    borderWidth: 1,
    maxWidth: '100%',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  clarificationButtonText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: '800',
  },
  clarificationOptions: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  composer: {
    ...sharedShadow,
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 54,
    padding: 7,
  },
  confidenceText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  errorBlock: {
    gap: 4,
  },
  errorList: {
    backgroundColor: '#FFF0EB',
    borderColor: '#F1C7BA',
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  errorMessage: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
  },
  errorSuggestions: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 18,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  inlineError: {
    alignItems: 'center',
    backgroundColor: '#FFF0EB',
    borderColor: '#F1C7BA',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  inlineErrorText: {
    color: colors.danger,
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  input: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    maxHeight: 92,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  keyboardWrap: {
    flex: 1,
  },
  messageBubble: {
    ...sharedShadow,
    borderRadius: radii.lg,
    maxWidth: '84%',
    paddingHorizontal: 15,
    paddingVertical: spacing.md,
  },
  messageMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    marginTop: spacing.sm,
  },
  messageRow: {
    width: '100%',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  quickPrompt: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.full,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    maxWidth: 220,
    paddingHorizontal: spacing.md,
  },
  quickPromptRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  quickPromptScroll: {
    flexGrow: 0,
  },
  quickPromptShelf: {
    flexShrink: 0,
    height: 44,
    justifyContent: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  quickPromptText: {
    color: colors.accentDark,
    fontSize: 12,
    fontWeight: '800',
  },
  screen: {
    paddingBottom: spacing.md,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 21,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  sendButtonDisabled: {
    backgroundColor: colors.muted,
    opacity: 0.65,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21,
  },
  timeText: {
    color: colors.muted,
    fontSize: 11,
  },
  title: {
    color: colors.ink,
    fontSize: 29,
    fontWeight: '900',
    lineHeight: 35,
  },
  typingBubble: {
    borderColor: colors.border,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingVertical: spacing.md,
  },
  typingDot: {
    backgroundColor: colors.muted,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  userBubble: {
    backgroundColor: colors.softAccent,
    borderBottomRightRadius: 6,
    borderColor: '#FFE1BC',
    borderWidth: 1,
  },
  userMessageRow: {
    alignItems: 'flex-end',
  },
  userMessageText: {
    color: colors.ink,
  },
});
