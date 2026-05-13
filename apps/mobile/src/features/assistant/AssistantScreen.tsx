import FontAwesome from '@expo/vector-icons/FontAwesome';
import type { AiOrderError, CartAction } from '@intelligent-bistro/contracts';
import { useMemo, useRef, useState } from 'react';
import {
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

import { parseAssistantOrder } from './assistantApi';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  timestamp: Date;
  actionResults?: CartActionResult[];
  confidence?: number;
  errors?: AiOrderError[];
};

const quickPrompts = [
  'Add two spicy chicken sandwiches and a large water',
  'Make the coke large',
  'What is in my cart?',
];

export function AssistantScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Tell me what to add, remove, update, clear, or ask what is in your cart.',
      timestamp: new Date(),
    },
  ]);

  const cartLines = useCartStore(selectCartLines);
  const applyActions = useCartStore((state) => state.applyActions);
  const { error: menuError, isLoading: isMenuLoading, itemsById } = useMenu();

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
      const response = await parseAssistantOrder({
        cart: cartPayload,
        message: trimmedMessage,
      });
      const actionResults = applyCartActions(response.actions);

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          actionResults,
          confidence: response.confidence,
          errors: response.errors,
          id: createMessageId('assistant'),
          role: 'assistant',
          text: response.assistantMessage,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          errors: [
            {
              code: 'validation_error',
              message: 'The assistant service could not be reached.',
            },
          ],
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

  function applyCartActions(actions: CartAction[]) {
    if (actions.length === 0) {
      return [];
    }

    return applyActions(actions, itemsById);
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
            <MessageBubble key={message.id} message={message} />
          ))}
          {isSending ? <TypingBubble /> : null}
        </ScrollView>

        <ScrollView
          contentContainerStyle={styles.quickPromptRow}
          horizontal
          showsHorizontalScrollIndicator={false}>
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

function MessageBubble({ message }: { message: ChatMessage }) {
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
          <ActionHistory results={message.actionResults} />
        ) : null}
        {message.errors && message.errors.length > 0 ? <ErrorList errors={message.errors} /> : null}
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

function ActionHistory({ results }: { results: CartActionResult[] }) {
  return (
    <View style={styles.actionHistory}>
      <Text style={styles.actionHistoryTitle}>Cart actions</Text>
      {results.map((result, index) => (
        <View key={`${result.action.type}-${index}`} style={styles.actionRow}>
          <View
            style={[
              styles.actionDot,
              result.status === 'applied' ? styles.actionDotApplied : styles.actionDotMuted,
            ]}
          />
          <Text style={styles.actionText}>{formatActionResult(result)}</Text>
        </View>
      ))}
    </View>
  );
}

function ErrorList({ errors }: { errors: AiOrderError[] }) {
  return (
    <View style={styles.errorList}>
      {errors.map((error, index) => (
        <View key={`${error.code}-${index}`} style={styles.errorBlock}>
          <Text style={styles.errorMessage}>{error.message}</Text>
          {error.suggestions && error.suggestions.length > 0 ? (
            <Text style={styles.errorSuggestions}>Try: {error.suggestions.join(', ')}</Text>
          ) : null}
        </View>
      ))}
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

function formatTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const sharedShadow = {
  elevation: 6,
  shadowColor: colors.cardShadow,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
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
    backgroundColor: '#F8F1E8',
    borderRadius: radii.md,
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
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
    borderBottomLeftRadius: 6,
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
    padding: spacing.md,
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
    backgroundColor: colors.softAccent,
    borderRadius: radii.full,
    maxWidth: 220,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quickPromptRow: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  },
  userMessageRow: {
    alignItems: 'flex-end',
  },
  userMessageText: {
    color: colors.ink,
  },
});
