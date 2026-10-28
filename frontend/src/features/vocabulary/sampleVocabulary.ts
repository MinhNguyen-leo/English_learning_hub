import { validate, type Vocabulary, type VocabularyInput } from './model'

export function createSampleVocabulary(): Vocabulary[] {
  const now = new Date().toISOString()
  return sampleVocabulary.map((input) => ({
    ...validate(input),
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
  }))
}

export const sampleVocabulary: VocabularyInput[] = [
  {
    word: 'improve',
    english_meaning: 'To become better or make something better.',
    vietnamese_meaning: 'Cải thiện, trở nên tốt hơn.',
    part_of_speech: 'Verb (Động từ)',
    synonyms: 'enhance, develop',
    antonyms: 'worsen, deteriorate',
    example_sentence:
      'Reading every day can improve your vocabulary. — Đọc mỗi ngày có thể cải thiện vốn từ vựng của bạn.',
    note: 'Từ mẫu — có thể sửa hoặc xóa. Cách dùng: improve your skills; improve at something.',
  },
  {
    word: 'confident',
    english_meaning:
      'Feeling sure about your abilities or the likely success of something.',
    vietnamese_meaning:
      'Tự tin vào khả năng của mình hoặc kết quả của một việc.',
    part_of_speech: 'Adjective (Tính từ)',
    synonyms: 'self-assured, assured',
    antonyms: 'insecure, unsure',
    example_sentence:
      'She feels confident about speaking English. — Cô ấy cảm thấy tự tin khi nói tiếng Anh.',
    note: 'Từ mẫu — có thể sửa hoặc xóa. Cách dùng: confident about something; confident that + mệnh đề.',
  },
  {
    word: 'opportunity',
    english_meaning: 'A chance to do something useful or desirable.',
    vietnamese_meaning: 'Cơ hội để làm điều có ích hoặc mong muốn.',
    part_of_speech: 'Noun (Danh từ)',
    synonyms: 'chance, opening',
    antonyms: 'obstacle, barrier (trở ngại, nghĩa đối lập theo ngữ cảnh)',
    example_sentence:
      'This course is an opportunity to meet new people. — Khóa học này là cơ hội để gặp gỡ những người mới.',
    note: 'Từ mẫu — có thể sửa hoặc xóa. Danh từ đếm được: an opportunity to do something. Không có từ trái nghĩa trực tiếp trong mọi ngữ cảnh.',
  },
  {
    word: 'carefully',
    english_meaning: 'With attention in order to avoid mistakes or damage.',
    vietnamese_meaning:
      'Một cách cẩn thận, chú ý để tránh sai sót hoặc thiệt hại.',
    part_of_speech: 'Adverb (Trạng từ)',
    synonyms: 'cautiously, attentively',
    antonyms: 'carelessly, recklessly',
    example_sentence:
      'Please read the instructions carefully. — Hãy đọc kỹ hướng dẫn.',
    note: 'Từ mẫu — có thể sửa hoặc xóa. Trạng từ của careful; dùng để bổ nghĩa cho động từ.',
  },
  {
    word: 'give up',
    english_meaning: 'To stop trying to do something because it is difficult.',
    vietnamese_meaning: 'Bỏ cuộc, ngừng cố gắng vì gặp khó khăn.',
    part_of_speech: 'Phrasal verb (Cụm động từ)',
    synonyms: 'quit, surrender',
    antonyms: 'persist, persevere',
    example_sentence:
      'Do not give up when learning feels difficult. — Đừng bỏ cuộc khi việc học trở nên khó khăn.',
    note: 'Từ mẫu — có thể sửa hoặc xóa. Cách dùng: give up doing something; give up on a goal.',
  },
]
