import { simulateTap, simulateInput, simulateScroll, simulateLongPress } from './AgentDebugBridge';
import { getNode } from './utils/AgentRegistry';

jest.mock('./utils/AgentRegistry', () => ({
  getNode: jest.fn(),
}));

describe('Agent Actions', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('simulateTap', () => {
    it('should call onPress for a found node', () => {
      const mockOnPress = jest.fn();
      (getNode as jest.Mock).mockReturnValue({ onPress: mockOnPress });
      simulateTap('test-id');
      expect(mockOnPress).toHaveBeenCalled();
    });

    it('should not throw for a node without onPress', () => {
      (getNode as jest.Mock).mockReturnValue({});
      expect(() => simulateTap('test-id')).not.toThrow();
    });

    it('should not throw for a node that is not found', () => {
      (getNode as jest.Mock).mockReturnValue(null);
      expect(() => simulateTap('test-id')).not.toThrow();
    });
  });

  describe('simulateInput', () => {
    it('should call onChangeText for a found node', () => {
      const mockOnChangeText = jest.fn();
      (getNode as jest.Mock).mockReturnValue({ onChangeText: mockOnChangeText });
      simulateInput('test-id', 'test-value');
      expect(mockOnChangeText).toHaveBeenCalledWith('test-value');
    });

    it('should not throw for a node without onChangeText', () => {
      (getNode as jest.Mock).mockReturnValue({});
      expect(() => simulateInput('test-id', 'test-value')).not.toThrow();
    });
  });

  describe('simulateScroll', () => {
    it('should call scrollBy for a found node', () => {
      const mockScrollBy = jest.fn();
      (getNode as jest.Mock).mockReturnValue({ ref: { current: { scrollBy: mockScrollBy } } });
      simulateScroll('test-id', 'down', 100);
      expect(mockScrollBy).toHaveBeenCalledWith({ left: 0, top: 100, behavior: 'smooth' });
    });

    it('should not throw for a node without scrollTo', () => {
      (getNode as jest.Mock).mockReturnValue({ ref: { current: {} } });
      expect(() => simulateScroll('test-id', 'down', 100)).not.toThrow();
    });
  });

  describe('simulateLongPress', () => {
    it('should call onLongPress for a found node', () => {
      const mockOnLongPress = jest.fn();
      (getNode as jest.Mock).mockReturnValue({ onLongPress: mockOnLongPress });
      simulateLongPress('test-id');
      expect(mockOnLongPress).toHaveBeenCalled();
    });

    it('should not throw for a node without onLongPress', () => {
      (getNode as jest.Mock).mockReturnValue({});
      expect(() => simulateLongPress('test-id')).not.toThrow();
    });

    it('should not throw for a node that is not found', () => {
      (getNode as jest.Mock).mockReturnValue(null);
      expect(() => simulateLongPress('test-id')).not.toThrow();
    });
  });
});
